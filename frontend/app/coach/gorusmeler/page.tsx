"use client";

import MeetingsClient from "@/app/admin/coaching/meetings/MeetingsClient";

export default function CoachGorusmelerPage() {
  return (
    <div className="coach-gorusmeler-page">
      <header className="coach-page-header">
        <h2>Görüşmeler</h2>
        <p>Koçluk görüşmelerinizi planlayın ve takip edin</p>
      </header>
      <div className="coach-gorusmeler-body">
        <MeetingsClient />
      </div>
    </div>
  );
}
