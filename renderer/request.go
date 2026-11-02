package sceneengine

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/url"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	// Embedded originals: four 5 MiB images and two 20 MiB videos plus base64 expansion.
	MaxRequestBytes    = 96 << 20
	maxDimension       = 8192
	maxFPS             = 240
	maxFrames          = 1_000_000
	maxAudioTracks     = 64
	maxVolume          = 4
	maxDurationSeconds = 24 * 60 * 60
)

// DecodeRequest rejects unknown fields, trailing documents and oversized input.
func DecodeRequest(reader io.Reader) (Request, error) {
	data, err := io.ReadAll(io.LimitReader(reader, MaxRequestBytes+1))
	if err != nil {
		return Request{}, fmt.Errorf("read scene request: %w", err)
	}
	if len(data) > MaxRequestBytes {
		return Request{}, fmt.Errorf("scene request exceeds %d bytes", MaxRequestBytes)
	}
	var request Request
	if bytes.HasPrefix(bytes.TrimSpace(data), []byte("{")) {
		decoder := json.NewDecoder(bytes.NewReader(data))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&request); err != nil {
			return request, fmt.Errorf("decode scene JSON: %w", err)
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			return request, fmt.Errorf("scene JSON must contain one document")
		}
	} else {
		decoder := yaml.NewDecoder(bytes.NewReader(data))
		decoder.KnownFields(true)
		if err := decoder.Decode(&request); err != nil {
			return request, fmt.Errorf("decode scene YAML: %w", err)
		}
		if err := decoder.Decode(new(any)); err != io.EOF {
			return request, fmt.Errorf("scene YAML must contain one document")
		}
	}
	if _, err := request.browserPayload(); err != nil {
		return request, fmt.Errorf("props must contain JSON-compatible values: %w", err)
	}
	return request, nil
}

func (r Request) Validate() error {
	if r.Version != ProtocolVersion {
		return fmt.Errorf("unsupported scene protocol version %d", r.Version)
	}
	if strings.TrimSpace(r.SceneID) == "" {
		return fmt.Errorf("sceneId is required")
	}
	if _, err := parseOrigin(r.URL); err != nil {
		return fmt.Errorf("scene URL: %w", err)
	}
	if err := r.Config.validate(); err != nil {
		return err
	}
	if len(r.Audio) > maxAudioTracks {
		return fmt.Errorf("at most %d audio tracks are supported", maxAudioTracks)
	}
	for index, track := range r.Audio {
		if err := track.validate(r.Config.Duration()); err != nil {
			return fmt.Errorf("audio[%d]: %w", index, err)
		}
	}
	if _, err := r.browserPayload(); err != nil {
		return fmt.Errorf("serialize scene props: %w", err)
	}
	return nil
}

func (c Config) validate() error {
	if c.Width <= 0 || c.Height <= 0 || c.Width > maxDimension || c.Height > maxDimension {
		return fmt.Errorf("width and height must be between 1 and %d", maxDimension)
	}
	if c.Width%2 != 0 || c.Height%2 != 0 {
		return fmt.Errorf("video width and height must be even")
	}
	if !finite(c.FPS) || c.FPS <= 0 || c.FPS > maxFPS {
		return fmt.Errorf("fps must be between 0 and %d", maxFPS)
	}
	if c.DurationInFrames <= 0 || c.DurationInFrames > maxFrames {
		return fmt.Errorf("durationInFrames must be between 1 and %d", maxFrames)
	}
	if !finite(c.Duration()) || c.Duration() > maxDurationSeconds {
		return fmt.Errorf("scene duration must not exceed %d seconds", maxDurationSeconds)
	}
	if !finite(c.CaptionSafeBottom) || c.CaptionSafeBottom < 0 || c.CaptionSafeBottom > 0.5 {
		return fmt.Errorf("captionSafeBottom must be between 0 and 0.5")
	}
	return nil
}

func (a AudioTrack) validate(totalDuration float64) error {
	if strings.TrimSpace(a.File) == "" {
		return fmt.Errorf("file is required")
	}
	if !finite(a.Start) || a.Start < 0 || a.Start >= totalDuration {
		return fmt.Errorf("start must fall inside the composition")
	}
	if !finite(a.From) || a.From < 0 {
		return fmt.Errorf("from must be nonnegative")
	}
	if !finite(a.Duration) || a.Duration <= 0 {
		return fmt.Errorf("duration must be positive")
	}
	if a.Volume != nil && (!finite(*a.Volume) || *a.Volume < 0 || *a.Volume > maxVolume) {
		return fmt.Errorf("volume must be between 0 and %d", maxVolume)
	}
	return nil
}

func finite(value float64) bool { return !math.IsNaN(value) && !math.IsInf(value, 0) }

func parseOrigin(raw string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Host == "" || parsed.User != nil {
		return "", fmt.Errorf("expected an absolute HTTP(S) URL without credentials")
	}
	return strings.ToLower(parsed.Scheme + "://" + parsed.Host), nil
}
