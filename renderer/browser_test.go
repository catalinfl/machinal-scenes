package sceneengine

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func browserFixture(t *testing.T, progress func(Progress)) (*Renderer, Request) {
	t.Helper()
	browser, ffmpeg, directory := os.Getenv("SCENE_BROWSER"), os.Getenv("SCENE_FFMPEG"), os.Getenv("SCENE_FIXTURE_DIR")
	if browser == "" || ffmpeg == "" || directory == "" {
		t.Skip("configure SCENE_BROWSER, SCENE_FFMPEG and SCENE_FIXTURE_DIR for native tests")
	}
	server := httptest.NewServer(http.FileServer(http.Dir(directory)))
	t.Cleanup(server.Close)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	t.Cleanup(cancel)
	renderer, err := New(ctx, Options{BrowserExecutable: browser, FFmpegExecutable: ffmpeg, Concurrency: 2, FrameTimeout: 10 * time.Second, Progress: progress})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(renderer.Close)
	request := fixtureRequest()
	request.URL = server.URL + "/scene.html"
	request.Seed = "native-test"
	request.Config.FPS = 12
	request.Config.DurationInFrames = 24
	return renderer, request
}

func TestBrowserDeterministicFrames(t *testing.T) {
	renderer, request := browserFixture(t, nil)
	worker, err := renderer.newWorker(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	defer worker.close()
	first, err := worker.capture(context.Background(), 18)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := worker.capture(context.Background(), 3); err != nil {
		t.Fatal(err)
	}
	repeated, err := worker.capture(context.Background(), 18)
	if err != nil {
		t.Fatal(err)
	}
	assertCapturePixelsEqual(t, first, repeated)
	second, err := renderer.newWorker(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	defer second.close()
	parallel, err := second.capture(context.Background(), 18)
	if err != nil {
		t.Fatal(err)
	}
	assertCapturePixelsEqual(t, first, parallel)
}

func assertCapturePixelsEqual(t *testing.T, first, second []byte) {
	t.Helper()
	a, err := png.Decode(bytes.NewReader(first))
	if err != nil {
		t.Fatal(err)
	}
	b, err := png.Decode(bytes.NewReader(second))
	if err != nil {
		t.Fatal(err)
	}
	if a.Bounds() != b.Bounds() {
		t.Fatal("capture dimensions differ")
	}
	for y := a.Bounds().Min.Y; y < a.Bounds().Max.Y; y++ {
		for x := a.Bounds().Min.X; x < a.Bounds().Max.X; x++ {
			ar, ag, ab, aa := a.At(x, y).RGBA()
			br, bg, bb, ba := b.At(x, y).RGBA()
			if ar != br || ag != bg || ab != bb || aa != ba {
				t.Fatalf("capture pixels differ at %d,%d: %d,%d,%d,%d vs %d,%d,%d,%d", x, y, ar, ag, ab, aa, br, bg, bb, ba)
			}
		}
	}
}

func TestBrowserRenderVideoAndAudio(t *testing.T) {
	renderer, request := browserFixture(t, nil)
	root := t.TempDir()
	audio := filepath.Join(root, "tone.wav")
	generate := exec.Command(renderer.options.FFmpegExecutable, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-y", audio)
	if data, err := generate.CombinedOutput(); err != nil {
		t.Fatalf("create audio fixture: %v: %s", err, data)
	}
	request.Audio = []AudioTrack{{File: audio, Start: 0.5, Duration: 1}}
	output := filepath.Join(root, "scene.mp4")
	result, err := renderer.Render(context.Background(), request, output)
	if err != nil {
		t.Fatal(err)
	}
	if !result.HasAudio || result.Frames != 24 || result.Duration != 2 {
		t.Fatalf("invalid result: %+v", result)
	}
	hash, size, err := fingerprint(output)
	if err != nil {
		t.Fatal(err)
	}
	if hash != result.SHA256 || size != result.Size {
		t.Fatal("manifest fingerprint does not match encoded bytes")
	}
	if _, err := os.Stat(output + ".scene.json"); err != nil {
		t.Fatal(err)
	}
	streams := probeStreams(t, output)
	if len(streams) != 2 || streams[0].CodecName != "h264" || streams[0].Width != 640 || streams[0].Height != 360 || streams[0].Frames != "24" || streams[1].CodecName != "aac" {
		t.Fatalf("unexpected encoded streams: %+v", streams)
	}
	if _, err := renderer.Render(context.Background(), request, output); err == nil {
		t.Fatal("overwrote an existing output")
	}
}

func TestBrowserLosslessRGBMatchesCapturedPixels(t *testing.T) {
	renderer, request := browserFixture(t, nil)
	renderer.options.Lossless = true
	renderer.options.X264Preset = "ultrafast"
	renderer.options.EncoderThreads = 2
	request.Config.DurationInFrames = 6
	worker, err := renderer.newWorker(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	capture, err := worker.capture(context.Background(), 3)
	worker.close()
	if err != nil {
		t.Fatal(err)
	}
	image, err := png.Decode(bytes.NewReader(capture))
	if err != nil {
		t.Fatal(err)
	}
	want := make([]byte, 0, request.Config.Width*request.Config.Height*3)
	for y := 0; y < request.Config.Height; y++ {
		for x := 0; x < request.Config.Width; x++ {
			r, g, b, _ := image.At(x, y).RGBA()
			want = append(want, byte(r>>8), byte(g>>8), byte(b>>8))
		}
	}
	output := filepath.Join(t.TempDir(), "lossless.mp4")
	result, err := renderer.Render(context.Background(), request, output)
	if err != nil {
		t.Fatal(err)
	}
	got, err := exec.Command(renderer.options.FFmpegExecutable, "-v", "error", "-i", output, "-vf", `select=eq(n\,3)`, "-frames:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1").Output()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(want, got) {
		if len(want) != len(got) {
			t.Fatalf("lossless RGB byte count: want %d, got %d", len(want), len(got))
		}
		for i := range want {
			if want[i] != got[i] {
				t.Fatalf("lossless scene RGB differs at pixel %d,%d channel %d: want %d, got %d", i/3%request.Config.Width, i/3/request.Config.Width, i%3, want[i], got[i])
			}
		}
	}
	if result.Metrics.Workers != 2 || result.Metrics.CaptureAndEncode <= 0 || result.Metrics.SeekWorkerTime <= 0 {
		t.Fatalf("missing stage measurements: %+v", result.Metrics)
	}
}

func TestBrowserAlpha(t *testing.T) {
	renderer, request := browserFixture(t, nil)
	request.Config.Transparent = true
	request.Config.DurationInFrames = 6
	worker, err := renderer.newWorker(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	buffer, err := worker.capture(context.Background(), 3)
	worker.close()
	if err != nil {
		t.Fatal(err)
	}
	assertTransparentCorner(t, buffer)
	output := filepath.Join(t.TempDir(), "overlay.webm")
	result, err := renderer.Render(context.Background(), request, output)
	if err != nil {
		t.Fatal(err)
	}
	if !result.Transparent || result.Codec != VP9 {
		t.Fatalf("invalid transparent result: %+v", result)
	}
	decoded, err := exec.Command(renderer.options.FFmpegExecutable, "-hide_banner", "-loglevel", "error", "-c:v", "libvpx-vp9", "-i", output, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1").Output()
	if err != nil {
		t.Fatalf("decode transparent video: %v", err)
	}
	assertTransparentCorner(t, decoded)
}

func TestBrowserCancellationAndReuse(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancelled := false
	renderer, request := browserFixture(t, func(progress Progress) {
		if progress.WrittenFrames == 2 && !cancelled {
			cancelled = true
			cancel()
		}
	})
	output := filepath.Join(t.TempDir(), "cancelled.mp4")
	_, err := renderer.Render(ctx, request, output)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("expected cancellation, got %v", err)
	}
	for _, path := range []string{output, output + ".scene.json"} {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("cancelled job published %s", path)
		}
	}
	request.Config.DurationInFrames = 6
	if _, err := renderer.Render(context.Background(), request, output); err != nil {
		t.Fatalf("browser could not be reused after cancellation: %v", err)
	}
}

func TestBrowserReportsSceneFailure(t *testing.T) {
	renderer, request := browserFixture(t, nil)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`<script>window.__scene = { version: 1, ready: async () => { throw new Error('missing scene resource'); } };</script>`))
	}))
	defer server.Close()
	request.URL = server.URL
	_, err := renderer.Render(context.Background(), request, filepath.Join(t.TempDir(), "failed.mp4"))
	if err == nil || !strings.Contains(err.Error(), "missing scene resource") {
		t.Fatalf("lost scene error: %v", err)
	}
}

func TestBrowserFrameTimeoutDoesNotPublishOutput(t *testing.T) {
	renderer, request := browserFixture(t, nil)
	renderer.options.FrameTimeout = time.Second
	request.Config.DurationInFrames = 1
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte(`<script>window.__scene = { version: 1, manifest: window.__sceneRequest, ready: async () => {}, seek: () => new Promise(() => {}) };</script>`))
	}))
	defer server.Close()
	request.URL = server.URL
	output := filepath.Join(t.TempDir(), "timed-out.mp4")
	_, err := renderer.Render(context.Background(), request, output)
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected frame deadline, got %v", err)
	}
	if _, err := os.Stat(output); !os.IsNotExist(err) {
		t.Fatal("timed-out frame published an asset")
	}
}

func assertTransparentCorner(t *testing.T, data []byte) {
	t.Helper()
	image, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatal(err)
	}
	_, _, _, alpha := image.At(0, 0).RGBA()
	if alpha != 0 {
		t.Fatalf("expected alpha zero at empty corner, got %d", alpha)
	}
}

type probeStream struct {
	CodecName string `json:"codec_name"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	Frames    string `json:"nb_frames"`
}

func probeStreams(t *testing.T, path string) []probeStream {
	t.Helper()
	executable := os.Getenv("SCENE_FFPROBE")
	if executable == "" {
		t.Fatal("SCENE_FFPROBE is required for native verification")
	}
	data, err := exec.Command(executable, "-v", "error", "-show_streams", "-of", "json", path).Output()
	if err != nil {
		t.Fatalf("probe rendered output: %v", err)
	}
	var result struct {
		Streams []probeStream `json:"streams"`
	}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatal(err)
	}
	return result.Streams
}
