package sceneengine

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

func stageOutput(output string) (string, error) {
	if _, err := os.Stat(output); err == nil {
		return "", fmt.Errorf("output already exists: %s", output)
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("inspect output: %w", err)
	}
	if _, err := os.Stat(output + ".scene.json"); err == nil {
		return "", fmt.Errorf("asset manifest already exists: %s.scene.json", output)
	} else if !os.IsNotExist(err) {
		return "", fmt.Errorf("inspect asset manifest: %w", err)
	}
	staged, err := os.CreateTemp(filepath.Dir(output), ".scene-*"+filepath.Ext(output))
	if err != nil {
		return "", fmt.Errorf("stage video output: %w", err)
	}
	if err := staged.Close(); err != nil {
		os.Remove(staged.Name())
		return "", fmt.Errorf("close staged output: %w", err)
	}
	return staged.Name(), nil
}

func publishOutput(staged, output string, request Request, manifest Manifest, codec Codec, elapsed time.Duration, metrics RenderMetrics) (Result, error) {
	hash, size, err := fingerprint(staged)
	if err != nil {
		return Result{}, err
	}
	absolute, err := filepath.Abs(output)
	if err != nil {
		return Result{}, fmt.Errorf("resolve output path: %w", err)
	}
	result := Result{Version: ProtocolVersion, File: absolute, SHA256: hash, Size: size, Duration: request.Config.Duration(), Width: request.Config.Width, Height: request.Config.Height, FPS: request.Config.FPS, Frames: request.Config.DurationInFrames, HasAudio: len(request.Audio) > 0, Transparent: request.Config.Transparent, Codec: codec, Scene: manifest, Elapsed: elapsed}
	result.Metrics = metrics
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return Result{}, fmt.Errorf("encode asset manifest: %w", err)
	}
	// A same-directory hard link publishes complete bytes without replacing an
	// existing asset if another process claimed the destination during rendering.
	if err := os.Link(staged, output); err != nil {
		return Result{}, fmt.Errorf("publish video asset: %w", err)
	}
	if err := writeExclusive(output+".scene.json", data); err != nil {
		os.Remove(output)
		return Result{}, err
	}
	return result, nil
}

func fingerprint(path string) (string, int64, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", 0, fmt.Errorf("open rendered asset: %w", err)
	}
	defer file.Close()
	hash := sha256.New()
	size, err := io.Copy(hash, file)
	if err != nil {
		return "", 0, fmt.Errorf("fingerprint rendered asset: %w", err)
	}
	return hex.EncodeToString(hash.Sum(nil)), size, nil
}

func writeExclusive(path string, data []byte) error {
	file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("create asset manifest: %w", err)
	}
	_, writeErr := file.Write(data)
	closeErr := file.Close()
	if writeErr != nil {
		os.Remove(path)
		return fmt.Errorf("write asset manifest: %w", writeErr)
	}
	if closeErr != nil {
		os.Remove(path)
		return fmt.Errorf("close asset manifest: %w", closeErr)
	}
	return nil
}
