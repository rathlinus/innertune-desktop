// ytm-login — grab the YouTube Music credentials Music Assistant needs.
//
// Opens a controlled Chrome window with its own profile, lets you log into
// music.youtube.com (Google login + 2FA happen normally in the browser), then
// reads exactly what the YT Music web client uses to authenticate itself:
//
//   - the full cookie jar   -> Music Assistant "Login Cookie"
//   - VISITOR_DATA          -> Music Assistant "Visitor Data"   (needed for audio)
//
// It prints both, copy-paste ready, and also writes them to ytm-session.txt.
// Pure Go standard library only (incl. a tiny hand-rolled WebSocket client for
// the Chrome DevTools Protocol), so the binary is small and builds offline.
package main

import (
	"bufio"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	captureTimeout = 5 * time.Minute
	pollInterval   = 2 * time.Second
	authCookie     = "SAPISID"           // only present once signed in
	requiredField  = "__Secure-3PAPISID" // Music Assistant rejects a cookie without it
)

// The DevTools endpoint Chrome actually bound. We launch with
// --remote-debugging-port=0 and read the real port (and the browser websocket
// path) from the DevToolsActivePort file, so we never collide with a port that's
// in use or sits inside a Windows reserved/excluded range.
var (
	debugPort   int
	browserWsRe string // browser websocket path, e.g. /devtools/browser/<uuid>
)

func chromeCandidates() []string {
	return []string{
		os.Getenv("CHROME_PATH"),
		// Windows
		`C:\Program Files\Google\Chrome\Application\chrome.exe`,
		`C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`,
		filepath.Join(os.Getenv("LOCALAPPDATA"), `Google\Chrome\Application\chrome.exe`),
		// macOS
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		// Linux
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/snap/bin/chromium",
	}
}

func chromePath() (string, error) {
	for _, p := range chromeCandidates() {
		if p == "" {
			continue
		}
		if _, err := os.Stat(p); err == nil {
			return p, nil
		}
	}
	return "", errors.New("could not find Chrome/Chromium - install Google Chrome, or set the CHROME_PATH environment variable to its executable")
}

func profileDir() string {
	if p := os.Getenv("YTM_PROFILE"); p != "" {
		return p
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".ytm-login", "chrome-profile")
}

func outputDir() string {
	if exe, err := os.Executable(); err == nil {
		return filepath.Dir(exe)
	}
	wd, _ := os.Getwd()
	return wd
}

// ---- minimal WebSocket client (CDP only) -----------------------------------

type wsConn struct {
	conn net.Conn
	r    *bufio.Reader
}

func wsDial(rawURL string) (*wsConn, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	host := u.Host
	if u.Port() == "" {
		host = net.JoinHostPort(u.Hostname(), "80")
	}
	conn, err := net.DialTimeout("tcp", host, 5*time.Second)
	if err != nil {
		return nil, err
	}
	keyBytes := make([]byte, 16)
	if _, err := rand.Read(keyBytes); err != nil {
		conn.Close()
		return nil, err
	}
	key := base64.StdEncoding.EncodeToString(keyBytes)
	path := u.RequestURI()
	if path == "" {
		path = "/"
	}
	req := "GET " + path + " HTTP/1.1\r\n" +
		"Host: " + u.Host + "\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Key: " + key + "\r\n" +
		"Sec-WebSocket-Version: 13\r\n\r\n"
	if _, err := conn.Write([]byte(req)); err != nil {
		conn.Close()
		return nil, err
	}
	r := bufio.NewReader(conn)
	status, err := r.ReadString('\n')
	if err != nil {
		conn.Close()
		return nil, err
	}
	if !strings.Contains(status, "101") {
		conn.Close()
		return nil, fmt.Errorf("websocket upgrade failed: %s", strings.TrimSpace(status))
	}
	// drain the remaining response headers
	for {
		line, err := r.ReadString('\n')
		if err != nil {
			conn.Close()
			return nil, err
		}
		if line == "\r\n" || line == "\n" {
			break
		}
	}
	return &wsConn{conn: conn, r: r}, nil
}

func (w *wsConn) close() { _ = w.conn.Close() }

// writeText sends a single masked text frame (client frames must be masked).
func (w *wsConn) writeText(payload []byte) error {
	var header []byte
	header = append(header, 0x81) // FIN + text opcode
	n := len(payload)
	switch {
	case n < 126:
		header = append(header, byte(0x80|n))
	case n <= 0xFFFF:
		header = append(header, 0x80|126)
		var ext [2]byte
		binary.BigEndian.PutUint16(ext[:], uint16(n))
		header = append(header, ext[:]...)
	default:
		header = append(header, 0x80|127)
		var ext [8]byte
		binary.BigEndian.PutUint64(ext[:], uint64(n))
		header = append(header, ext[:]...)
	}
	mask := make([]byte, 4)
	if _, err := rand.Read(mask); err != nil {
		return err
	}
	header = append(header, mask...)
	masked := make([]byte, n)
	for i := 0; i < n; i++ {
		masked[i] = payload[i] ^ mask[i%4]
	}
	if _, err := w.conn.Write(header); err != nil {
		return err
	}
	_, err := w.conn.Write(masked)
	return err
}

// readMessage reads one complete (possibly fragmented) text/binary message,
// transparently handling and skipping control frames.
func (w *wsConn) readMessage() ([]byte, error) {
	var msg []byte
	for {
		b0, err := w.r.ReadByte()
		if err != nil {
			return nil, err
		}
		fin := b0&0x80 != 0
		opcode := b0 & 0x0F
		b1, err := w.r.ReadByte()
		if err != nil {
			return nil, err
		}
		masked := b1&0x80 != 0
		var length uint64
		switch b1 & 0x7F {
		case 126:
			var ext [2]byte
			if _, err := io.ReadFull(w.r, ext[:]); err != nil {
				return nil, err
			}
			length = uint64(binary.BigEndian.Uint16(ext[:]))
		case 127:
			var ext [8]byte
			if _, err := io.ReadFull(w.r, ext[:]); err != nil {
				return nil, err
			}
			length = binary.BigEndian.Uint64(ext[:])
		default:
			length = uint64(b1 & 0x7F)
		}
		var maskKey [4]byte
		if masked {
			if _, err := io.ReadFull(w.r, maskKey[:]); err != nil {
				return nil, err
			}
		}
		payload := make([]byte, length)
		if _, err := io.ReadFull(w.r, payload); err != nil {
			return nil, err
		}
		if masked {
			for i := range payload {
				payload[i] ^= maskKey[i%4]
			}
		}
		switch opcode {
		case 0x8: // close
			return nil, errors.New("websocket closed by peer")
		case 0x9, 0xA: // ping/pong — ignore
			continue
		default: // text, binary, or continuation
			msg = append(msg, payload...)
			if fin {
				return msg, nil
			}
		}
	}
}

// ---- CDP plumbing -----------------------------------------------------------
//
// Everything goes over the browser WebSocket (whose URL we build from the
// DevToolsActivePort file). We deliberately avoid Chrome's HTTP /json endpoints:
// they're flaky across versions, whereas the websocket + Target.getTargets path
// is stable and needs no port that could land in a Windows excluded range.

// cdpCall opens a websocket, sends one command, returns the matching result.
func cdpCall(wsURL, method string, params map[string]any) (json.RawMessage, error) {
	ws, err := wsDial(wsURL)
	if err != nil {
		return nil, err
	}
	defer ws.close()
	_ = ws.conn.SetDeadline(time.Now().Add(10 * time.Second))

	cmd := map[string]any{"id": 1, "method": method}
	if params != nil {
		cmd["params"] = params
	}
	body, _ := json.Marshal(cmd)
	if err := ws.writeText(body); err != nil {
		return nil, err
	}
	for {
		msg, err := ws.readMessage()
		if err != nil {
			return nil, err
		}
		var env struct {
			ID     *int            `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  *struct {
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal(msg, &env); err != nil {
			continue
		}
		if env.ID == nil || *env.ID != 1 {
			continue // an event, not our response
		}
		if env.Error != nil {
			return nil, fmt.Errorf("CDP %s: %s", method, env.Error.Message)
		}
		return env.Result, nil
	}
}

type targetInfo struct {
	TargetID string `json:"targetId"`
	Type     string `json:"type"`
	URL      string `json:"url"`
}

func browserWsURL() (string, error) {
	if browserWsRe == "" {
		return "", errors.New("browser websocket path not known yet")
	}
	return fmt.Sprintf("ws://127.0.0.1:%d%s", debugPort, browserWsRe), nil
}

// getTargets lists Chrome's open targets over the browser websocket (no HTTP).
func getTargets() ([]targetInfo, error) {
	wsURL, err := browserWsURL()
	if err != nil {
		return nil, err
	}
	res, err := cdpCall(wsURL, "Target.getTargets", nil)
	if err != nil {
		return nil, err
	}
	var out struct {
		TargetInfos []targetInfo `json:"targetInfos"`
	}
	if err := json.Unmarshal(res, &out); err != nil {
		return nil, err
	}
	return out.TargetInfos, nil
}

// pageWsURL builds the websocket URL for a page target id.
func pageWsURL(targetID string) string {
	return fmt.Sprintf("ws://127.0.0.1:%d/devtools/page/%s", debugPort, targetID)
}

type cdpCookie struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Domain string `json:"domain"`
}

func getAllCookies() ([]cdpCookie, error) {
	wsURL, err := browserWsURL()
	if err != nil {
		return nil, err
	}
	res, err := cdpCall(wsURL, "Storage.getCookies", nil)
	if err != nil {
		return nil, err
	}
	var out struct {
		Cookies []cdpCookie `json:"cookies"`
	}
	if err := json.Unmarshal(res, &out); err != nil {
		return nil, err
	}
	return out.Cookies, nil
}

type ytcfg struct {
	LoggedIn           bool   `json:"loggedIn"`
	VisitorData        string `json:"visitorData"`
	DelegatedSessionID string `json:"delegatedSessionId"`
}

const ytcfgExpr = `JSON.stringify((function () {
  var g = (window.ytcfg && ytcfg.get) ? ytcfg.get.bind(ytcfg) : function () { return undefined; };
  var ctx = g('INNERTUBE_CONTEXT') || null;
  return {
    loggedIn: g('LOGGED_IN') === true,
    visitorData: g('VISITOR_DATA') || (ctx && ctx.client && ctx.client.visitorData) || '',
    delegatedSessionId: g('DELEGATED_SESSION_ID') || ''
  };
})())`

func cdpEvaluate(pageWs, expr string) (string, error) {
	res, err := cdpCall(pageWs, "Runtime.evaluate", map[string]any{
		"expression":    expr,
		"returnByValue": true,
	})
	if err != nil {
		return "", err
	}
	var out struct {
		Result struct {
			Value string `json:"value"`
		} `json:"result"`
	}
	if err := json.Unmarshal(res, &out); err != nil {
		return "", err
	}
	return out.Result.Value, nil
}

func getYtcfg() (ytcfg, error) {
	var empty ytcfg
	targets, err := getTargets()
	if err != nil {
		return empty, err
	}
	var pageWs string
	for _, t := range targets {
		if t.Type == "page" && strings.Contains(t.URL, "music.youtube.com") {
			pageWs = pageWsURL(t.TargetID)
			break
		}
	}
	if pageWs == "" {
		return empty, nil
	}
	value, err := cdpEvaluate(pageWs, ytcfgExpr)
	if err != nil || value == "" {
		return empty, err
	}
	var cfg ytcfg
	if err := json.Unmarshal([]byte(value), &cfg); err != nil {
		return empty, err
	}
	return cfg, nil
}

// ---- capture ----------------------------------------------------------------

func toCookieHeader(cookies []cdpCookie) string {
	type kv struct{ k, v string }
	seen := map[string]bool{}
	var ordered []kv
	for _, c := range cookies {
		if !strings.Contains(c.Domain, "google") && !strings.Contains(c.Domain, "youtube") {
			continue
		}
		if seen[c.Name] {
			for i := range ordered {
				if ordered[i].k == c.Name {
					ordered[i].v = c.Value
				}
			}
			continue
		}
		seen[c.Name] = true
		ordered = append(ordered, kv{c.Name, c.Value})
	}
	parts := make([]string, len(ordered))
	for i, p := range ordered {
		parts[i] = p.k + "=" + p.v
	}
	return strings.Join(parts, "; ")
}

func launchChrome() error {
	bin, err := chromePath()
	if err != nil {
		return err
	}
	dir := profileDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	// Clear any stale port file so we only ever read the port for THIS launch.
	_ = os.Remove(filepath.Join(dir, "DevToolsActivePort"))
	cmd := exec.Command(bin,
		"--remote-debugging-port=0", // let Chrome pick a free port; we read it back
		"--user-data-dir="+dir,
		"--no-first-run",
		"--no-default-browser-check",
		"--new-window",
		"https://music.youtube.com/",
	)
	return cmd.Start() // don't Wait — let Chrome keep running after we exit
}

// resolveDebugPort waits for Chrome to write its DevToolsActivePort file (first
// line = the port it bound) and records it for all subsequent CDP calls.
func resolveDebugPort() error {
	portFile := filepath.Join(profileDir(), "DevToolsActivePort")
	deadline := time.Now().Add(30 * time.Second)
	for time.Now().Before(deadline) {
		if data, err := os.ReadFile(portFile); err == nil {
			// Line 1 is the port; line 2 (when present) is the browser ws path.
			lines := strings.Split(strings.TrimSpace(string(data)), "\n")
			if port, err := strconv.Atoi(strings.TrimSpace(lines[0])); err == nil && port > 0 {
				debugPort = port
				if len(lines) > 1 {
					browserWsRe = strings.TrimSpace(lines[1])
				}
				return nil
			}
		}
		time.Sleep(500 * time.Millisecond)
	}
	return errors.New("Chrome did not expose its DevTools port - is Chrome able to start?")
}

var brandRe = regexp.MustCompile(`^\d{21}$`)

func report(cookies []cdpCookie, cfg ytcfg) {
	cookieHeader := toCookieHeader(cookies)
	bar := strings.Repeat("=", 70)
	var b strings.Builder
	fmt.Fprintln(&b)
	fmt.Fprintln(&b, bar)
	fmt.Fprintln(&b, "  Paste these into the YouTube Music provider in Music Assistant")
	fmt.Fprintln(&b, bar)
	fmt.Fprintln(&b)
	fmt.Fprintln(&b, "Visitor Data:")
	fmt.Fprintln(&b, cfg.VisitorData)
	fmt.Fprintln(&b)
	fmt.Fprintln(&b, "Login Cookie:")
	fmt.Fprintln(&b, cookieHeader)
	fmt.Fprintln(&b)
	fmt.Fprintln(&b, "Username:")
	if brandRe.MatchString(cfg.DelegatedSessionID) {
		fmt.Fprintln(&b, cfg.DelegatedSessionID+"   (brand account id - use this exact value)")
	} else {
		fmt.Fprintln(&b, "(your Google account email - only matters for brand accounts)")
	}
	fmt.Fprintln(&b)
	fmt.Fprintln(&b, bar)
	if !strings.Contains(cookieHeader, requiredField) {
		fmt.Fprintln(&b)
		fmt.Fprintf(&b, "WARNING: the cookie is missing %s. Music Assistant will\n", requiredField)
		fmt.Fprintln(&b, "reject it. Make sure you are fully signed in, then run me again.")
	}

	text := b.String()
	fmt.Print(text)

	outFile := filepath.Join(outputDir(), "ytm-session.txt")
	if err := os.WriteFile(outFile, []byte(text), 0o600); err != nil {
		fmt.Printf("\n(could not write ytm-session.txt: %v)\n", err)
	} else {
		fmt.Printf("\nSaved a copy to: %s\n", outFile)
	}
}

func waitForLogin() ([]cdpCookie, ytcfg, error) {
	deadline := time.Now().Add(captureTimeout)
	time.Sleep(1500 * time.Millisecond) // give Chrome a beat to open the debug port
	noticed := false
	for time.Now().Before(deadline) {
		cookies, err := getAllCookies()
		if err == nil {
			signedIn := false
			for _, c := range cookies {
				if c.Name == authCookie && c.Value != "" {
					signedIn = true
					break
				}
			}
			if signedIn {
				if !noticed {
					fmt.Println("  signed in - waiting for the player to finish loading...")
					noticed = true
				}
				// SAPISID lands on .google.com mid-login, before music.youtube.com
				// reboots as authenticated and exposes its blessed visitorData.
				// Capturing early yields a stale visitorData that leaves audio
				// bot-walled, so we wait for the music client to report loggedIn.
				if cfg, err := getYtcfg(); err == nil && cfg.LoggedIn && cfg.VisitorData != "" {
					return cookies, cfg, nil
				}
			}
		}
		time.Sleep(pollInterval)
	}
	return nil, ytcfg{}, errors.New("timed out waiting for login - close the Chrome window and run me again")
}

func main() {
	fmt.Println("ytm-login - YouTube Music credential grabber")
	fmt.Println()
	fmt.Println("Opening Chrome. Log into music.youtube.com in the window that appears.")
	fmt.Println("(Already logged in from a previous run? This finishes in a second.)")
	fmt.Println()

	if err := launchChrome(); err != nil {
		fmt.Fprintf(os.Stderr, "\nERROR: %v\n", err)
		os.Exit(1)
	}
	if err := resolveDebugPort(); err != nil {
		fmt.Fprintf(os.Stderr, "\nERROR: %v\n", err)
		os.Exit(1)
	}
	if os.Getenv("YTM_SELFTEST") != "" {
		selftest()
		return
	}

	cookies, cfg, err := waitForLogin()
	if err != nil {
		fmt.Fprintf(os.Stderr, "\nERROR: %v\n", err)
		os.Exit(1)
	}
	report(cookies, cfg)
	fmt.Println("\nDone. You can close the Chrome window now.")
}

// selftest exercises the WebSocket/CDP pipeline against a live Chrome without
// requiring a login: it round-trips Storage.getCookies, a large Runtime.evaluate
// (to verify big-frame reads), and the ytcfg read. Triggered by YTM_SELFTEST=1.
func selftest() {
	// Wait for Chrome's debug port to come up (cold start can take a few seconds).
	var cookies []cdpCookie
	var err error
	for i := 0; i < 20; i++ {
		time.Sleep(time.Second)
		if cookies, err = getAllCookies(); err == nil {
			break
		}
	}
	if err != nil {
		fmt.Fprintf(os.Stderr, "SELFTEST getAllCookies failed: %v\n", err)
		os.Exit(1)
	}
	hasField := false
	for _, c := range cookies {
		if c.Name == requiredField {
			hasField = true
		}
	}
	fmt.Printf("SELFTEST cookies=%d has_%s=%v\n", len(cookies), requiredField, hasField)

	targets, _ := getTargets()
	var pageWs string
	for _, t := range targets {
		if t.Type == "page" {
			pageWs = pageWsURL(t.TargetID)
			break
		}
	}
	if pageWs != "" {
		big, err := cdpEvaluate(pageWs, "'x'.repeat(200000)")
		if err != nil {
			fmt.Fprintf(os.Stderr, "SELFTEST big evaluate failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("SELFTEST big_payload_len=%d (expect 200000)\n", len(big))
		if len(big) != 200000 {
			os.Exit(1)
		}
	}
	cfg, _ := getYtcfg()
	fmt.Printf("SELFTEST loggedIn=%v visitorData_len=%d\n", cfg.LoggedIn, len(cfg.VisitorData))
	fmt.Println("SELFTEST ok")
}
