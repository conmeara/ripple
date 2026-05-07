"use client"

import { motion } from "motion/react"
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react"
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import { cn } from "../../lib/utils"
import {
  clampRippleReviewPaneWidth,
  getRippleCenterReviewLayout,
  getRippleReviewPaneWidthBounds,
  RIPPLE_PANEL_ANIMATION_SECONDS,
} from "./ripple-shell-layout"

const RESIZE_KEYBOARD_STEP = 24

interface RippleCenterReviewLayoutProps {
  centerStageOpen: boolean
  reviewPaneOpen: boolean
  reviewPaneWidth: number
  onReviewPaneWidthChange: (width: number) => void
  center: ReactNode
  review: ReactNode
}

export function RippleCenterReviewLayout({
  centerStageOpen,
  reviewPaneOpen,
  reviewPaneWidth,
  onReviewPaneWidthChange,
  center,
  review,
}: RippleCenterReviewLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hasMeasuredRef = useRef(false)
  const initialAnimationFrameRef = useRef<number | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [shouldAnimateLayout, setShouldAnimateLayout] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [localReviewPaneWidth, setLocalReviewPaneWidth] = useState<
    number | null
  >(null)

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return

    const measure = () => {
      setContainerWidth(element.getBoundingClientRect().width)
      if (!hasMeasuredRef.current) {
        hasMeasuredRef.current = true
        initialAnimationFrameRef.current = requestAnimationFrame(() => {
          setShouldAnimateLayout(true)
        })
      }
    }

    measure()

    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(element)

    return () => {
      resizeObserver.disconnect()
      if (initialAnimationFrameRef.current !== null) {
        cancelAnimationFrame(initialAnimationFrameRef.current)
      }
    }
  }, [])

  const effectiveReviewPaneWidth = localReviewPaneWidth ?? reviewPaneWidth
  const layout = useMemo(
    () =>
      getRippleCenterReviewLayout({
        containerWidth,
        reviewPaneWidth: effectiveReviewPaneWidth,
        centerStageOpen,
        reviewPaneOpen,
      }),
    [
      centerStageOpen,
      containerWidth,
      effectiveReviewPaneWidth,
      reviewPaneOpen,
    ],
  )

  const transition = useMemo(
    () => ({
      duration:
        isResizing || !shouldAnimateLayout
          ? 0
          : RIPPLE_PANEL_ANIMATION_SECONDS,
      ease: [0.4, 0, 0.2, 1] as const,
    }),
    [isResizing, shouldAnimateLayout],
  )

  const commitReviewPaneWidth = useCallback(
    (width: number) => {
      const nextWidth = clampRippleReviewPaneWidth({
        width,
        containerWidth,
      })
      onReviewPaneWidthChange(nextWidth)
      setLocalReviewPaneWidth(null)
    },
    [containerWidth, onReviewPaneWidthChange],
  )

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!centerStageOpen || !reviewPaneOpen || event.button !== 0) return

      event.preventDefault()
      event.stopPropagation()

      const startX = event.clientX
      const startWidth = effectiveReviewPaneWidth
      const pointerId = event.pointerId
      const handleElement = event.currentTarget
      let hasMoved = false
      let finalWidth = startWidth
      const previousCursor = document.body.style.cursor
      const previousUserSelect = document.body.style.userSelect

      handleElement.setPointerCapture?.(pointerId)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"
      setIsResizing(true)

      const updateWidth = (clientX: number) => {
        const nextWidth = clampRippleReviewPaneWidth({
          width: startWidth + startX - clientX,
          containerWidth,
        })
        finalWidth = nextWidth
        setLocalReviewPaneWidth(nextWidth)
      }

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        if (!hasMoved && Math.abs(pointerEvent.clientX - startX) < 3) return
        hasMoved = true
        updateWidth(pointerEvent.clientX)
      }

      const finishResize = () => {
        if (handleElement.hasPointerCapture?.(pointerId)) {
          handleElement.releasePointerCapture(pointerId)
        }

        document.removeEventListener("pointermove", handlePointerMove)
        document.removeEventListener("pointerup", finishResize)
        document.removeEventListener("pointercancel", finishResize)
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
        setIsResizing(false)

        if (hasMoved) {
          onReviewPaneWidthChange(finalWidth)
        }
        setLocalReviewPaneWidth(null)
      }

      document.addEventListener("pointermove", handlePointerMove)
      document.addEventListener("pointerup", finishResize, { once: true })
      document.addEventListener("pointercancel", finishResize, { once: true })
    },
    [
      centerStageOpen,
      containerWidth,
      effectiveReviewPaneWidth,
      onReviewPaneWidthChange,
      reviewPaneOpen,
    ],
  )

  const handleResizeKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!centerStageOpen || !reviewPaneOpen) return

      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault()
        const direction = event.key === "ArrowLeft" ? 1 : -1
        commitReviewPaneWidth(
          reviewPaneWidth + direction * RESIZE_KEYBOARD_STEP,
        )
        return
      }

      if (event.key === "Home" || event.key === "End") {
        event.preventDefault()
        const bounds = getRippleReviewPaneWidthBounds(containerWidth)
        commitReviewPaneWidth(event.key === "Home" ? bounds.min : bounds.max)
      }
    },
    [
      centerStageOpen,
      commitReviewPaneWidth,
      containerWidth,
      reviewPaneOpen,
      reviewPaneWidth,
    ],
  )

  const showDivider = centerStageOpen && reviewPaneOpen

  return (
    <div
      ref={containerRef}
      className="flex min-h-0 min-w-0 flex-1 overflow-hidden"
      data-testid="ripple-center-review-layout"
    >
      <motion.div
        initial={false}
        animate={{
          width: layout.centerWidth,
          opacity: centerStageOpen ? 1 : 0,
        }}
        transition={transition}
        className={cn(
          "min-h-0 overflow-hidden",
          centerStageOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!centerStageOpen}
      >
        {centerStageOpen ? center : null}
      </motion.div>

      <motion.div
        initial={false}
        animate={{
          width: layout.dividerWidth,
          opacity: showDivider ? 1 : 0,
        }}
        transition={transition}
        className="relative z-10 min-h-0 shrink-0"
        aria-hidden={!showDivider}
      >
        <div className="absolute inset-0 bg-border/70" />
        <div
          role="separator"
          aria-label="Resize preview and review panels"
          aria-orientation="vertical"
          tabIndex={showDivider ? 0 : -1}
          className={cn(
            "absolute bottom-0 top-0 w-[9px] -translate-x-1/2 cursor-col-resize outline-none transition-colors focus-visible:bg-primary/30",
            showDivider ? "pointer-events-auto" : "pointer-events-none",
          )}
          style={{ left: `${layout.dividerWidth / 2}px` }}
          data-testid="ripple-center-review-resize-handle"
          onPointerDown={handleResizePointerDown}
          onKeyDown={handleResizeKeyDown}
        />
      </motion.div>

      <motion.div
        initial={false}
        animate={{
          width: layout.reviewWidth,
          opacity: reviewPaneOpen ? 1 : 0,
        }}
        transition={transition}
        className={cn(
          "min-h-0 overflow-hidden",
          reviewPaneOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!reviewPaneOpen}
      >
        {reviewPaneOpen ? review : null}
      </motion.div>
    </div>
  )
}
