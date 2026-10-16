import GorevFormClient from '@/components/gorev/GorevFormClient';
import '@/components/gorev/gorev.css';
import '@/components/gorev/editor/gorev-editor.css';

export default function AdminGorevYeniPage() {
  return (
    <div className="gorev-editor-page">
      <GorevFormClient />
    </div>
  );
}
