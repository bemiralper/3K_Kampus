"use client";

import { useEffect, useState, type ReactNode } from "react";
import FinansFormDrawer, { FinansDrawerButton } from "./FinansFormDrawer";
import FinansStepper, { type FinansStepperStep } from "./FinansStepper";

export interface FinansWizardStep extends FinansStepperStep {
  content: ReactNode;
  /** Bu adımdan ileri gitmeden önce çalışır; false dönerse geçiş engellenir (hataları kendi state'ine yazması beklenir). */
  validate?: () => boolean;
  /** Sunucudan/parent'tan gelen fieldErrors'da bu adıma ait anahtarlar varsa otomatik olarak bu adıma dönülür. */
  fields?: string[];
  /** true ise adım tamamen atlanır (örn. taksit sayısı 1 iken taksit adımı). */
  hidden?: boolean;
}

export interface FinansWizardDrawerProps {
  open?: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  variant: "gelir" | "gider";
  headerIcon?: ReactNode;
  steps: FinansWizardStep[];
  /** Adım geçişlerinde otomatik geri dönüş için parent'ın sahip olduğu alan hataları. */
  fieldErrors?: Record<string, string>;
  generalError?: string | null;
  onSubmit: () => void;
  saving?: boolean;
  submitLabel?: string;
  wide?: boolean;
}

export default function FinansWizardDrawer({
  open = true,
  onClose,
  title,
  subtitle,
  variant,
  headerIcon,
  steps,
  fieldErrors,
  generalError,
  onSubmit,
  saving = false,
  submitLabel = "Kaydet",
  wide = true,
}: FinansWizardDrawerProps) {
  const visibleSteps = steps.filter((s) => !s.hidden);
  const [activeId, setActiveId] = useState<string | undefined>(visibleSteps[0]?.id);
  const [furthestId, setFurthestId] = useState<string | undefined>(visibleSteps[0]?.id);

  // Drawer her açıldığında ilk adıma dön.
  useEffect(() => {
    if (open) {
      setActiveId(visibleSteps[0]?.id);
      setFurthestId(visibleSteps[0]?.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Sunucu/parent hatası bu adımda olmayan bir alana aitse, ilgili adıma otomatik dön.
  useEffect(() => {
    if (!fieldErrors || Object.keys(fieldErrors).length === 0) return;
    const erroredStepIndex = visibleSteps.findIndex((s) => s.fields?.some((f) => fieldErrors[f]));
    if (erroredStepIndex === -1) return;
    const erroredStep = visibleSteps[erroredStepIndex];
    if (erroredStep.id === activeId) return;
    setActiveId(erroredStep.id);
    setFurthestId((prev) => {
      const prevIdx = visibleSteps.findIndex((s) => s.id === prev);
      return erroredStepIndex > prevIdx ? erroredStep.id : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldErrors]);

  const activeIndex = Math.max(0, visibleSteps.findIndex((s) => s.id === activeId));
  const furthestIndex = Math.max(activeIndex, visibleSteps.findIndex((s) => s.id === furthestId));
  const activeStep = visibleSteps[activeIndex] ?? visibleSteps[0];
  const isFirst = activeIndex === 0;
  const isLast = activeIndex === visibleSteps.length - 1;

  const goTo = (index: number) => {
    const step = visibleSteps[index];
    if (step) setActiveId(step.id);
  };

  const handleNext = () => {
    if (activeStep?.validate && !activeStep.validate()) return;
    if (isLast) {
      onSubmit();
      return;
    }
    const nextIndex = activeIndex + 1;
    const nextStep = visibleSteps[nextIndex];
    if (nextStep) {
      setActiveId(nextStep.id);
      if (nextIndex > furthestIndex) setFurthestId(nextStep.id);
    }
  };

  const handleBack = () => {
    if (!isFirst) goTo(activeIndex - 1);
  };

  const handleStepClick = (index: number) => {
    if (index <= furthestIndex) goTo(index);
  };

  return (
    <FinansFormDrawer
      open={open}
      onClose={onClose}
      variant={variant}
      wide={wide}
      title={title}
      subtitle={subtitle}
      headerIcon={headerIcon}
      error={generalError}
      stepper={
        visibleSteps.length > 1 ? (
          <>
            <FinansStepper
              steps={visibleSteps}
              activeIndex={activeIndex}
              furthestIndex={furthestIndex}
              onStepClick={handleStepClick}
            />
            <p className="fd-step-caption">
              Adım {activeIndex + 1}/{visibleSteps.length} · {activeStep?.label}
            </p>
          </>
        ) : undefined
      }
      footer={
        <>
          {!isFirst && (
            <FinansDrawerButton variant="ghost" onClick={handleBack} disabled={saving}>
              Geri
            </FinansDrawerButton>
          )}
          <FinansDrawerButton
            tone={variant === "gider" ? "rose" : "emerald"}
            onClick={handleNext}
            disabled={saving}
          >
            {isLast ? (saving ? "Kaydediliyor…" : submitLabel) : "İleri"}
          </FinansDrawerButton>
        </>
      }
    >
      <div key={activeStep?.id}>{activeStep?.content}</div>
    </FinansFormDrawer>
  );
}
