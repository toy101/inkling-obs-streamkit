import { useCallback, useEffect, useRef, useState } from "react";

import { OVERLAY_HEIGHT, OVERLAY_WIDTH } from "../lib/overlay-canvas";
import {
  DEBUG_OVERLAY_AUTOPLAY_MESSAGE,
  DEBUG_OVERLAY_SLIDES,
  DEBUG_OVERLAY_SLIDE_MESSAGE,
  DEBUG_OVERLAY_STAGE_REVEAL_MESSAGE,
  DEBUG_OVERLAY_STAGE_REVEAL_TEXT_MESSAGE,
  isDebugOverlayReadyMessage,
} from "../lib/debug-overlay-preview";
import type {
  DebugOverlaySlideIndex,
  DebugStageRevealText,
} from "../lib/debug-overlay-preview";
import { Dock } from "./Dock";

const zoomOptions = [
  { value: "fit", label: "全体に合わせる" },
  { value: "0.25", label: "25%" },
  { value: "0.5", label: "50%" },
  { value: "0.75", label: "75%" },
  { value: "1", label: "100%（等倍）" },
] as const;

type ZoomMode = (typeof zoomOptions)[number]["value"];

const initialStageRevealText: DebugStageRevealText = {
  ruleName: "",
  ruleEn: "",
  ruleDescription: "",
  stageName: "",
  stageEn: "",
};

const stageRevealTextFields = [
  { key: "ruleName", label: "ルール名（日本語）" },
  { key: "ruleEn", label: "ルール名（英語）" },
  { key: "ruleDescription", label: "ルール説明（英語）" },
  { key: "stageName", label: "ステージ名（日本語）" },
  { key: "stageEn", label: "ステージ名（英語）" },
] as const;

export function Debug() {
  const overlayFrameRef = useRef<HTMLIFrameElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [isOverlayFrameLoaded, setIsOverlayFrameLoaded] = useState(false);
  const [isAutoplayEnabled, setIsAutoplayEnabled] = useState(true);
  const [stageRevealText, setStageRevealText] =
    useState<DebugStageRevealText>(initialStageRevealText);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit");
  const [fitScale, setFitScale] = useState(0);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      setFitScale(
        Math.min(
          entry.contentRect.width / OVERLAY_WIDTH,
          entry.contentRect.height / OVERLAY_HEIGHT,
          1,
        ),
      );
    });

    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const scale = zoomMode === "fit" ? fitScale : Number(zoomMode);
  const previewWidth = OVERLAY_WIDTH * scale;
  const previewHeight = OVERLAY_HEIGHT * scale;

  const showSlide = (slideIndex: DebugOverlaySlideIndex) => {
    overlayFrameRef.current?.contentWindow?.postMessage(
      { type: DEBUG_OVERLAY_SLIDE_MESSAGE, slideIndex },
      window.location.origin,
    );
  };

  const setAutoplay = useCallback((autoplay: boolean) => {
    overlayFrameRef.current?.contentWindow?.postMessage(
      { type: DEBUG_OVERLAY_AUTOPLAY_MESSAGE, autoplay },
      window.location.origin,
    );
  }, []);

  useEffect(() => {
    const receiveOverlayReady = (event: MessageEvent<unknown>) => {
      if (
        event.source !== overlayFrameRef.current?.contentWindow ||
        event.origin !== window.location.origin ||
        !isDebugOverlayReadyMessage(event.data)
      ) {
        return;
      }

      // The carousel mounts after its API response and can remount on selection changes.
      setAutoplay(isAutoplayEnabled);
    };

    window.addEventListener("message", receiveOverlayReady);
    return () => window.removeEventListener("message", receiveOverlayReady);
  }, [isAutoplayEnabled, setAutoplay]);

  const sendStageRevealText = (text: DebugStageRevealText) => {
    overlayFrameRef.current?.contentWindow?.postMessage(
      { type: DEBUG_OVERLAY_STAGE_REVEAL_TEXT_MESSAGE, text },
      window.location.origin,
    );
  };

  const updateStageRevealText = (text: DebugStageRevealText) => {
    setStageRevealText(text);
    sendStageRevealText(text);
  };

  const showStageReveal = () => {
    sendStageRevealText(stageRevealText);
    overlayFrameRef.current?.contentWindow?.postMessage(
      { type: DEBUG_OVERLAY_STAGE_REVEAL_MESSAGE },
      window.location.origin,
    );
  };

  return (
    <div className="debug">
      <aside className="debug-dock" aria-label="表示コントローラー">
        <Dock />
      </aside>

      <section className="debug-preview" aria-labelledby="preview-heading">
        <header className="debug-toolbar">
          <h1 id="preview-heading">Overlay プレビュー</h1>
          <div className="debug-toolbar-controls">
            <div className="debug-slide-controls" aria-label="表示スライド">
              <span>表示スライド</span>
              {DEBUG_OVERLAY_SLIDES.map(({ index, label }) => (
                <button
                  disabled={!isOverlayFrameLoaded}
                  key={index}
                  onClick={() => showSlide(index)}
                  type="button"
                >
                  {label}
                </button>
              ))}
              <button
                disabled={!isOverlayFrameLoaded}
                onClick={showStageReveal}
                type="button"
              >
                ステージ・ルール紹介
              </button>
              <button
                aria-pressed={isAutoplayEnabled}
                className="debug-slide-autoplay"
                disabled={!isOverlayFrameLoaded}
                onClick={() => {
                  const nextAutoplay = !isAutoplayEnabled;
                  setIsAutoplayEnabled(nextAutoplay);
                  setAutoplay(nextAutoplay);
                }}
                type="button"
              >
                自動切替: {isAutoplayEnabled ? "オン" : "オフ"}
              </button>
            </div>
            <label className="debug-zoom">
              表示倍率
              <select
                value={zoomMode}
                onChange={(event) => {
                  const option = zoomOptions.find(
                    ({ value }) => value === event.target.value,
                  );
                  if (option) {
                    setZoomMode(option.value);
                  }
                }}
              >
                {zoomOptions.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>

        <details className="debug-stage-reveal-text">
          <summary>紹介テキストを上書き</summary>
          <p id="stage-reveal-text-hint">
            紹介プレビューだけに即時反映します。動画の再生は続きます。
            空欄は再生開始時の表示を使います。
          </p>
          <fieldset
            aria-describedby="stage-reveal-text-hint"
            aria-label="紹介テキスト"
            disabled={!isOverlayFrameLoaded}
          >
            {stageRevealTextFields.map(({ key, label }) => (
              <label key={key}>
                {label}
                <input
                  onChange={(event) => updateStageRevealText({
                    ...stageRevealText,
                    [key]: event.target.value,
                  })}
                  placeholder="元の表示を使用"
                  type="text"
                  value={stageRevealText[key]}
                />
              </label>
            ))}
            <button
              onClick={() => updateStageRevealText(initialStageRevealText)}
              type="button"
            >
              元の表示に戻す
            </button>
          </fieldset>
        </details>

        <dl className="debug-metrics">
          <div>
            <dt>描画サイズ</dt>
            <dd>{OVERLAY_WIDTH} × {OVERLAY_HEIGHT} px</dd>
          </div>
          <div>
            <dt>比率</dt>
            <dd>16:9</dd>
          </div>
          <div>
            <dt>現在の倍率</dt>
            <dd>{(scale * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt>表示サイズ</dt>
            <dd>{Math.round(previewWidth)} × {Math.round(previewHeight)} px</dd>
          </div>
        </dl>

        <div className="debug-viewport" ref={viewportRef}>
          <div className="debug-preview-space">
            <div
              className="debug-stage"
              style={{ width: previewWidth, height: previewHeight }}
            >
              {/* Keep the viewport, CSS and storage events identical to the overlay page. */}
              <iframe
                className="debug-overlay-frame"
                onLoad={() => {
                  setIsOverlayFrameLoaded(true);
                  setAutoplay(isAutoplayEnabled);
                  sendStageRevealText(stageRevealText);
                }}
                ref={overlayFrameRef}
                title="1920 × 1080 Overlay プレビュー"
                src="?view=overlay"
                width={OVERLAY_WIDTH}
                height={OVERLAY_HEIGHT}
                style={{ transform: `scale(${scale})` }}
              />
            </div>
          </div>
        </div>

        <footer className="debug-preview-footer">
          <span>OBS ブラウザソース：幅 {OVERLAY_WIDTH} / 高さ {OVERLAY_HEIGHT}</span>
          <a href="?view=overlay" target="_blank" rel="noreferrer">Overlay を開く ↗</a>
        </footer>
      </section>
    </div>
  );
}
