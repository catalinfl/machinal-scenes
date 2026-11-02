package sceneengine

import (
	"strings"
	"testing"
)

func TestLosslessEncodingRetainsCaptureDetail(t *testing.T) {
	request := fixtureRequest()
	options := Options{Lossless: true, X264Preset: "ultrafast", EncoderThreads: 2}
	args := strings.Join(encoderArgs(request, H264, "scene.mp4", options), " ")
	for _, want := range []string{"-vcodec png", "-c:v libx264rgb", "-preset ultrafast", "-crf 0", "-pix_fmt rgb24", "-threads 2"} {
		if !strings.Contains(args, want) {
			t.Fatalf("missing %s in %s", want, args)
		}
	}
	request.Config.Transparent = true
	args = strings.Join(encoderArgs(request, VP9, "scene.webm", options), " ")
	if !strings.Contains(args, "-lossless 1") || !strings.Contains(args, "-pix_fmt yuva420p") {
		t.Fatal(args)
	}
}
