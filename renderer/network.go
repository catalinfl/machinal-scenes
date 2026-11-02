package sceneengine

import (
	"context"
	"strings"

	"github.com/chromedp/cdproto/cdp"
	"github.com/chromedp/cdproto/fetch"
	"github.com/chromedp/cdproto/network"
	"github.com/chromedp/chromedp"
)

func allowRequest(raw string, allowed map[string]bool) bool {
	if strings.HasPrefix(raw, "data:") || strings.HasPrefix(raw, "blob:") || raw == "about:blank" {
		return true
	}
	origin, err := parseOrigin(raw)
	return err == nil && allowed[origin]
}

func restrictNetwork(owner context.Context, requestURL string, extraOrigins []string, cancel context.CancelFunc) chromedp.Action[chromedp.Void] {
	allowed := make(map[string]bool)
	origin, _ := parseOrigin(requestURL)
	allowed[origin] = true
	for _, raw := range extraOrigins {
		origin, _ := parseOrigin(raw)
		allowed[origin] = true
	}
	return chromedp.Func(func(ctx context.Context, target *chromedp.Target) error {
		events := cdp.Events(owner, target, fetch.RequestPaused)
		go func() {
			for request, err := range events {
				if err != nil {
					return
				}
				if allowRequest(request.Request.URL, allowed) {
					_, err = cdp.Call(owner, target, fetch.ContinueRequest, fetch.ContinueRequestParams{RequestID: request.RequestID})
				} else {
					_, err = cdp.Call(owner, target, fetch.FailRequest, fetch.FailRequestParams{RequestID: request.RequestID, ErrorReason: network.ErrorReasonBlockedByClient})
				}
				if err != nil {
					cancel()
					return
				}
			}
		}()
		_, err := cdp.Call(ctx, target, fetch.Enable, fetch.EnableParams{})
		return err
	})
}
