"use client";

interface StepWizardProps {
  steps: string[];
  currentStep: number;
}

export default function StepWizard({ steps, currentStep }: StepWizardProps) {
  return (
    <div className="comm-wizard" role="navigation" aria-label="Adımlar">
      <div className="comm-wizard-track">
        {steps.map((label, i) => {
          const isActive = i === currentStep;
          const isDone = i < currentStep;
          return (
            <div
              key={label}
              className={`comm-wizard-step${isActive ? " active" : ""}${isDone ? " done" : ""}`}
              aria-current={isActive ? "step" : undefined}
            >
              <div className="comm-wizard-pill">
                <span className="comm-wizard-num" aria-hidden="true">
                  {isDone ? "✓" : i + 1}
                </span>
                <span className="comm-wizard-label">{label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className="comm-wizard-line" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
