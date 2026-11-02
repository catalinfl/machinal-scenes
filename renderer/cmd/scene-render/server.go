package main

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"
)

func serveScene(directory, sceneURL string) (string, func(), error) {
	info, err := os.Stat(directory)
	if err != nil || !info.IsDir() {
		return "", nil, fmt.Errorf("scene build directory is unavailable: %s", directory)
	}
	relative, err := url.Parse(sceneURL)
	if err != nil || relative.IsAbs() || relative.Host != "" {
		return "", nil, fmt.Errorf("with -serve, request URL must be a relative scene path")
	}
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", nil, fmt.Errorf("listen for scene files: %w", err)
	}
	server := &http.Server{Handler: http.FileServer(http.Dir(directory)), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		// Shutdown below is the expected termination path for this private file server.
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			server.Close()
		}
	}()
	base := &url.URL{Scheme: "http", Host: listener.Addr().String(), Path: "/"}
	closeServer := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(ctx); err != nil {
			server.Close()
		}
	}
	return base.ResolveReference(relative).String(), closeServer, nil
}
