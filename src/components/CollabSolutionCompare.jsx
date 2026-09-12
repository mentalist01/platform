import { DiffEditor } from './SelfHostedMonacoEditor.jsx';
import './CollabSolutionTabs.css';

const comparisonOptions = {
  readOnly: true,
  originalEditable: false,
  automaticLayout: true,
  minimap: { enabled: false },
  fontSize: 15,
  scrollBeyondLastLine: false,
  renderSideBySide: true,
  useInlineViewWhenSpaceIsLimited: true,
  enableSplitViewResizing: true,
  ignoreTrimWhitespace: false,
  renderIndicators: true,
  renderOverviewRuler: false,
  domReadOnly: true,
  padding: { top: 8 },
};

export default function CollabSolutionCompare({
  original = '',
  modified = '',
  originalName = 'Исходный вариант',
  modifiedName = 'Текущий вариант',
  theme = 'light',
}) {
  const dark = theme === 'vs-dark' || theme === 'hc-black' || theme.includes('dark');
  return (
    <section
      className={`collab-solution-compare${dark ? ' collab-solution-compare--dark' : ''}`}
      aria-label={`Сравнение кода: ${originalName} и ${modifiedName}`}
    >
      <div className="collab-solution-compare__names">
        <div title={originalName}><strong>{originalName}</strong><span>Исходный</span></div>
        <div title={modifiedName}><strong>{modifiedName}</strong><span>Текущий</span></div>
      </div>
      <div className="collab-solution-compare__editor">
        <DiffEditor
          original={original}
          modified={modified}
          language="python"
          theme={theme}
          height="100%"
          options={comparisonOptions}
          loading={<div className="collab-solution-compare__loading" role="status">Загружаем сравнение…</div>}
        />
      </div>
    </section>
  );
}
