package sceneengine

import (
	"encoding/json"
	"time"
)

const ProtocolVersion = 1

// Config uses frame indexes for duration and seconds only for FPS conversion.
type Config struct {
	Width             int     `json:"width" yaml:"width"`
	Height            int     `json:"height" yaml:"height"`
	FPS               float64 `json:"fps" yaml:"fps"`
	DurationInFrames  int     `json:"durationInFrames" yaml:"durationInFrames"`
	Transparent       bool    `json:"transparent,omitempty" yaml:"transparent,omitempty"`
	CaptionSafeBottom float64 `json:"captionSafeBottom,omitempty" yaml:"captionSafeBottom,omitempty"`
}

func (c Config) Duration() float64 { return float64(c.DurationInFrames) / c.FPS }

// AudioTrack describes a local source; the scene's browser never plays this audio.
type AudioTrack struct {
	File     string   `json:"file" yaml:"file"`
	Start    float64  `json:"start" yaml:"start"`
	From     float64  `json:"from,omitempty" yaml:"from,omitempty"`
	Duration float64  `json:"duration" yaml:"duration"`
	Volume   *float64 `json:"volume,omitempty" yaml:"volume,omitempty"`
}

// Request is a portable JSON/YAML render job. Relative audio paths are resolved by the CLI.
type Request struct {
	Version int            `json:"version" yaml:"version"`
	URL     string         `json:"url" yaml:"url"`
	SceneID string         `json:"sceneId" yaml:"sceneId"`
	Seed    string         `json:"seed,omitempty" yaml:"seed,omitempty"`
	Config  Config         `json:"config" yaml:"config"`
	Props   map[string]any `json:"props,omitempty" yaml:"props,omitempty"`
	Audio   []AudioTrack   `json:"audio,omitempty" yaml:"audio,omitempty"`
}

// Manifest records the resolved scene parameters reported by the browser runtime.
type Manifest struct {
	Version int            `json:"version"`
	SceneID string         `json:"sceneId"`
	Seed    string         `json:"seed"`
	Config  Config         `json:"config"`
	Props   map[string]any `json:"props"`
}

type Codec string

const (
	H264 Codec = "h264"
	VP9  Codec = "vp9"
)

// Result is the asset boundary between this module and an application.
type Result struct {
	Version     int           `json:"version"`
	File        string        `json:"file"`
	SHA256      string        `json:"sha256"`
	Size        int64         `json:"size"`
	Duration    float64       `json:"duration"`
	Width       int           `json:"width"`
	Height      int           `json:"height"`
	FPS         float64       `json:"fps"`
	Frames      int           `json:"frames"`
	HasAudio    bool          `json:"hasAudio"`
	Transparent bool          `json:"transparent"`
	Codec       Codec         `json:"codec"`
	Scene       Manifest      `json:"scene"`
	Elapsed     time.Duration `json:"elapsedNanoseconds"`
	Metrics     RenderMetrics `json:"metrics"`
}

type RenderMetrics struct {
	Workers           int           `json:"workers"`
	Load              time.Duration `json:"loadNanoseconds"`
	CaptureAndEncode  time.Duration `json:"captureAndEncodeNanoseconds"`
	EncoderDrain      time.Duration `json:"encoderDrainNanoseconds"`
	SeekWorkerTime    time.Duration `json:"seekWorkerNanoseconds"`
	CaptureWorkerTime time.Duration `json:"captureWorkerNanoseconds"`
}

type Progress struct {
	WrittenFrames int           `json:"writtenFrames"`
	TotalFrames   int           `json:"totalFrames"`
	Elapsed       time.Duration `json:"elapsedNanoseconds"`
}

// Options configures browser ownership and the bounded frame pipeline.
type Options struct {
	BrowserExecutable string
	FFmpegExecutable  string
	Concurrency       int
	FrameTimeout      time.Duration
	AllowedOrigins    []string
	NoSandbox         bool
	EnableGPU         bool
	Lossless          bool
	X264Preset        string
	EncoderThreads    int
	Progress          func(Progress)
}

func (r Request) browserPayload() ([]byte, error) {
	props := r.Props
	if props == nil {
		props = map[string]any{}
	}
	return json.Marshal(Manifest{Version: r.Version, SceneID: r.SceneID, Seed: r.Seed, Config: r.Config, Props: props})
}
