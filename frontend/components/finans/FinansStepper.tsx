"use client";

import type { ReactNode } from "react";

export interface FinansStepperStep {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface FinansStepperProps {
  steps: FinansStepperStep[];
  activeIndex: number;
  /** Kullanıcının şu ana kadar ulaştığı en ileri adım — bu adıma/öncesine tıklanabilir. */
  furthestIndex?: number;
  onStepClick?: (index: number) => void;
}

export default function FinansStepper({
  steps,
  activeIndex,
  furthestIndex,
  onStepClick,
}: FinansStepperProps) {
  const maxReached = furthestIndex ?? activeIndex;

  return (
    <div className="fd-stepper" role="tablist" aria-label="Adımlar">
      {steps.map((step, index) => {
        const isActive = index === activeIndex;
        const isDone = index < activeIndex;
        const isReachable = index <= maxReached && !!onStepClick;

        return (
          <div className="fd-step-wrap" key={step.id}>
            {index > 0 && (
              <span
                className={`fd-step-line${index <= maxReached ? " is-filled" : ""}`}
                aria-hidden
              />
            )}
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={step.label}
              className={`fd-step${isActive ? " is-active" : ""}${isDone ? " is-done" : ""}`}
              disabled={!isReachable}
              onClick={() => isReachable && onStepClick?.(index)}
            >
              <span className="fd-step-dot">
                {isDone ? (
                  <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 10l4 4 8-8" />
                  </svg>
                ) : (
                  step.icon ?? index + 1
                )}
              </span>
              <span className="fd-step-label">{step.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
