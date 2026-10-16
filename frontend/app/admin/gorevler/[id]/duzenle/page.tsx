import GorevFormClient from '@/components/gorev/GorevFormClient';
import '@/components/gorev/gorev.css';
import '@/components/gorev/editor/gorev-editor.css';

type Props = {
  params: { id: string };
};

export default function GorevDuzenlePage({ params }: Props) {
  return (
    <div className="gorev-editor-page">
      <GorevFormClient gorevId={params.id} />
    </div>
  );
}
