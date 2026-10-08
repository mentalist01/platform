import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { api, authenticatedUploadsFetch } from '../services/api';
import useWorkbookHelper from '../hooks/useWorkbookHelper';
import { buildDownloadUrl } from '../utils/downloadUrl';
import { getWorkbookHelperInstall, getWorkbookHelperUnsupportedMessage } from '../utils/workbookHelperInstall';
import { downloadAuthenticatedFile } from '../utils/fileDownload';
import './TeacherQuestionWorkbookPanel.css';

const workbookAttachments = (attachments, taskNumber) => (Array.isArray(attachments) ? attachments : [])
  .filter((file) => {
    const extension = String(file?.name || file?.storageName || '').split('.').pop().toLowerCase();
    return ['xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'fods'].includes(extension)
      || ([26, 27].includes(Number(taskNumber)) && ['txt', 'csv', 'tsv'].includes(extension));
  })
  .map((file) => ({ ...file, id: String(file.id || file.storageName || '').trim() }))
  .filter((file) => file.id);

function WorkbookPanel({ studentId, taskNumber, levelId, questionId, attachments, editable }) {
  const [state, setState] = useState({ solutions: [], loading: true, error: '' });
  const [deletingId, setDeletingId] = useState('');
  const { workbookHelperState, launchWorkbookHelper } = useWorkbookHelper();
  const workbookHelperInstall = getWorkbookHelperInstall();
  const workbookHelperSupported = workbookHelperInstall.supported;
  const files = useMemo(() => workbookAttachments(attachments, taskNumber), [attachments, taskNumber]);
  const load = useCallback(async () => {
    const payload = await api.getQuestionWorkbookSolutions(studentId, taskNumber, levelId, questionId);
    return Array.isArray(payload?.teacherSolutions) ? payload.teacherSolutions : [];
  }, [studentId, taskNumber, levelId, questionId]);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const solutions = await load();
        if (active) setState({ solutions, loading: false, error: '' });
      } catch (error) {
        if (active) setState((current) => ({ ...current, loading: false, error: error.message || 'Не удалось загрузить решения преподавателя.' }));
      }
    };
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    void refresh();
    const timer = window.setInterval(onFocus, 10000);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [load]);

  const refresh = async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try { setState({ solutions: await load(), loading: false, error: '' }); }
    catch (error) { setState((current) => ({ ...current, loading: false, error: error.message })); }
  };
  const open = (file, solution = null) => launchWorkbookHelper({
    sourceFile: file,
    questionContext: {
      studentId, taskNumber, levelId, questionId, attachmentId: file.id,
      startFresh: !solution, solutionFileId: solution?.fileId || '',
    },
  });
  const download = async (file) => {
    try {
      const url = new URL(file.url, window.location.origin);
      if (studentId) url.searchParams.set('studentId', studentId);
      await downloadAuthenticatedFile({ url: url.toString(), name: file.name, fetchFile: authenticatedUploadsFetch });
    } catch (error) { setState((current) => ({ ...current, error: error.message || 'Не удалось скачать таблицу.' })); }
  };
  const remove = async (solution) => {
    setDeletingId(solution.fileId);
    try {
      await api.deleteFile(solution.fileId);
      await refresh();
    } catch (error) { setState((current) => ({ ...current, error: error.message })); }
    finally { setDeletingId(''); }
  };
  const busy = ['launching', 'opening'].includes(workbookHelperState.status) || Boolean(deletingId);
  if (!editable && !state.solutions.length && !state.error) return null;
  return (
    <section className="teacher-question-workbooks" aria-label="Решения преподавателя">
      <header>
        <span className="teacher-question-workbooks__symbol"><FileSpreadsheet size={20} /></span>
        <div><h3>Решения преподавателя</h3><p>{editable
          ? workbookHelperSupported ? `Сохраняйте в Excel или LibreOffice (${workbookHelperInstall.saveShortcut}) — файл появится здесь и сразу будет доступен ученику.` : getWorkbookHelperUnsupportedMessage()
          : 'Преподаватель сохранил эти таблицы для вас. Их можно скачать.'}</p></div>
        <button type="button" onClick={() => void refresh()} disabled={state.loading} title="Обновить решения преподавателя"><RefreshCcw size={16} className={state.loading ? 'animate-spin' : ''} /><span>Обновить</span></button>
      </header>
      {editable && files.map((file) => {
        const saved = state.solutions.filter((solution) => solution.attachmentId === file.id && solution.canEdit === true);
        return <div className="teacher-question-workbooks__source" key={file.id}>
          <span><FileSpreadsheet size={16} />{file.name}</span>
          {file.url && <button type="button" onClick={() => void download(file)}><Download size={16} />Скачать</button>}
          {workbookHelperSupported && <button type="button" onClick={() => void open(file)} disabled={busy || state.loading || saved.length >= 3}>
            {saved.length ? <Plus size={16} /> : <FileSpreadsheet size={16} />}
            {saved.length ? 'Новое решение в LibreOffice' : 'Открыть в LibreOffice'}
          </button>}
          {saved.length >= 3 && <small>Сохранено 3 решения. Продолжите одно из них или удалите ненужное.</small>}
        </div>;
      })}
      <div className="teacher-question-workbooks__list">
        {state.solutions.map((solution) => {
          const file = files.find((entry) => entry.id === solution.attachmentId);
          const url = new URL(solution.url, window.location.origin);
          if (studentId) url.searchParams.set('studentId', studentId);
          const savedAt = solution.updatedAt && new Date(solution.updatedAt).toLocaleString('ru-RU');
          return <div className="teacher-question-workbooks__solution" key={solution.fileId}>
            <FileSpreadsheet size={19} />
            <div><strong>{solution.name}</strong><small>{[solution.authorName, savedAt, solution.size].filter(Boolean).join(' · ')}</small></div>
            <div className="teacher-question-workbooks__actions">
              {editable && workbookHelperSupported && solution.canEdit === true && file && <button type="button" onClick={() => void open(file, solution)} disabled={busy}>Продолжить в LibreOffice</button>}
              <a href={buildDownloadUrl(url.toString())} download={solution.name}><Download size={16} />Скачать</a>
              {editable && solution.canEdit === true && <button type="button" onClick={() => void remove(solution)} disabled={busy} title={`Удалить решение ${solution.name}`} aria-label={`Удалить решение ${solution.name}`}><Trash2 size={16} /></button>}
            </div>
          </div>;
        })}
      </div>
      {editable && !state.loading && !state.solutions.length && <p className="teacher-question-workbooks__hint">Ваши файлы хранятся отдельно. Ответы, решения и прогресс ученика сохраняются.</p>}
      {state.error && <p className="teacher-question-workbooks__error" role="alert">{state.error}</p>}
      {editable && workbookHelperState.status !== 'idle' && <div className="teacher-question-workbooks__hint" role="status">
        {workbookHelperState.message}
        {workbookHelperSupported && workbookHelperState.status === 'fallback' && workbookHelperInstall.url && <>
          <a href={workbookHelperInstall.url} download={workbookHelperInstall.isDownload || undefined}>{workbookHelperInstall.label}</a>
          {workbookHelperInstall.platform === 'mac' && <span>{workbookHelperInstall.badge}. {workbookHelperInstall.instructions}</span>}
        </>}
      </div>}
    </section>
  );
}

export default function TeacherQuestionWorkbookPanel(props) {
  if (!props.taskNumber || !props.levelId || !props.questionId || !workbookAttachments(props.attachments, props.taskNumber).length) return null;
  return <WorkbookPanel key={`${props.studentId || ''}:${props.taskNumber}:${props.levelId}:${props.questionId}`} {...props} />;
}
