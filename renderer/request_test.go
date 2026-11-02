package sceneengine

import (
	"math"
	"strings"
	"testing"
)

func fixtureRequest() Request {
	return Request{Version: 1, URL: "http://127.0.0.1:5178/scene.html", SceneID: "intro", Config: Config{Width: 640, Height: 360, FPS: 30, DurationInFrames: 90}}
}

func TestDecodeRequestRejectsAmbiguousInput(t *testing.T) {
	for _, input := range []string{
		`{"version":1,"unexpected":true}`,
		`{"version":1} {"version":1}`,
		"version: 1\n---\nversion: 1",
		"version: 1\nversion: 2",
		"version: 1\nunexpected: true",
	} {
		if _, err := DecodeRequest(strings.NewReader(input)); err == nil {
			t.Errorf("accepted ambiguous request %q", input)
		}
	}
}

func TestDecodeYAMLPropsAreJSONCompatible(t *testing.T) {
	request, err := DecodeRequest(strings.NewReader("version: 1\nprops:\n  title: Example\n  items: [1, two]\n"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := request.browserPayload(); err != nil {
		t.Fatal(err)
	}
}

func TestRequestValidation(t *testing.T) {
	cases := map[string]func(*Request){
		"odd dimensions":       func(r *Request) { r.Config.Width = 641 },
		"invalid fps":          func(r *Request) { r.Config.FPS = math.NaN() },
		"overflow duration":    func(r *Request) { r.Config.FPS = math.SmallestNonzeroFloat64 },
		"empty duration":       func(r *Request) { r.Config.DurationInFrames = 0 },
		"file URL":             func(r *Request) { r.URL = "file:///secret" },
		"credentials":          func(r *Request) { r.URL = "https://user:pass@example.com" },
		"invalid audio":        func(r *Request) { r.Audio = []AudioTrack{{File: "a.wav", Start: -1, Duration: 1}} },
		"invalid caption band": func(r *Request) { r.Config.CaptionSafeBottom = 0.7 },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			request := fixtureRequest()
			mutate(&request)
			if err := request.Validate(); err == nil {
				t.Fatal("accepted invalid request")
			}
		})
	}
	if err := fixtureRequest().Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestCaptionSafeBandSurvivesYAMLAndBrowserPayload(t *testing.T) {
	request, err := DecodeRequest(strings.NewReader("version: 1\nconfig:\n  width: 1920\n  height: 1080\n  fps: 30\n  durationInFrames: 30\n  captionSafeBottom: 0.24\n"))
	if err != nil || request.Config.CaptionSafeBottom != 0.24 {
		t.Fatal(request, err)
	}
	payload, err := request.browserPayload()
	if err != nil || !strings.Contains(string(payload), `"captionSafeBottom":0.24`) {
		t.Fatal(string(payload), err)
	}
}

func TestResourceOrigins(t *testing.T) {
	allowed := map[string]bool{"http://127.0.0.1:5178": true}
	for _, request := range []string{"http://127.0.0.1:5178/font.woff2", "data:image/png;base64,AA==", "blob:http://127.0.0.1:5178/id"} {
		if !allowRequest(request, allowed) {
			t.Errorf("blocked %s", request)
		}
	}
	for _, request := range []string{"http://127.0.0.1:8080/private", "file:///secret", "https://example.com/font.woff2", "http://127.0.0.1:5178@evil.test"} {
		if allowRequest(request, allowed) {
			t.Errorf("allowed %s", request)
		}
	}
}

func TestAlphaRequiresWebM(t *testing.T) {
	if _, err := outputCodec("scene.mp4", true); err == nil {
		t.Fatal("accepted alpha MP4")
	}
	if codec, err := outputCodec("scene.webm", true); err != nil || codec != VP9 {
		t.Fatalf("expected VP9, got %s, %v", codec, err)
	}
}
