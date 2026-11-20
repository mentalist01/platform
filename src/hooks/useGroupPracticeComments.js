import {useEffect, useLayoutEffect, useMemo, useState} from 'react';
import {api} from '../services/api.js';

export const asPythonComments = text => text.split(/\r\n|\r|\n/).map(line => line ? '# ' + line : '#').join('\n');

export function useGroupPracticeSolutions({groupId, pageId, solutionId, userId}) {
  const request = useMemo(() => ({groupId, pageId, solutionId, userId}), [groupId, pageId, solutionId, userId]);
  const [saved, setSaved] = useState(null);
  const version = saved?.request === request ? saved.version : null;

  useEffect(() => {
    if (!request.groupId || !request.solutionId) return;
    const controller = new AbortController();
    api.getLearningGroupCodeWork(request.groupId, request.pageId, request.solutionId, 0, controller.signal)
      .then(({versions}) => {
        if (!controller.signal.aborted) setSaved({request, version: versions[0]});
      })
      .catch(() => {});
    return () => controller.abort();
  }, [request]);

  return version;
}

export function useGroupPracticeComments(editorRef, editorMountVersion, entries) {
  const text = useMemo(() => entries?.length ? [
    '# Решение с практики',
    ...entries.flatMap(({name, text}) => [
      ...(entries.length > 1 ? ['# ' + name] : []),
      asPythonComments(text),
    ]),
  ].join('\n') : '', [entries]);
  usePythonCommentZone(editorRef, editorMountVersion, text);
}

export function usePythonCommentZone(editorRef, editorMountVersion, text, atStart = false) {
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || !text) return;

    // Keep the saved solution in the editor's view, outside its collaborative model.
    const host = document.createElement('div');
    host.className = 'collab-practice-comments-zone';
    const comments = document.createElement('pre');
    comments.className = 'collab-practice-comments';
    comments.tabIndex = 0;
    comments.setAttribute('aria-label', atStart ? 'Общий код' : 'Решение с практики');
    comments.textContent = text;
    host.append(comments);

    const zone = {afterLineNumber: 0, heightInPx: 1, domNode: host, showInHiddenAreas: true};
    let zoneId;
    let disposed = false;
    const updateZone = () => {
      const model = editor.getModel();
      if (!model || disposed) return;
      const afterLineNumber = atStart ? 0 : model.getLineCount();
      const heightInPx = Math.max(1, comments.offsetHeight);
      if (zoneId && zone.afterLineNumber === afterLineNumber && zone.heightInPx === heightInPx) return;
      zone.afterLineNumber = afterLineNumber;
      zone.heightInPx = heightInPx;
      editor.changeViewZones(accessor => {
        if (zoneId) accessor.layoutZone(zoneId);
        else zoneId = accessor.addZone(zone);
      });
    };
    const updateWidth = ({contentWidth, verticalScrollbarWidth}) => {
      comments.style.width = Math.max(1, contentWidth - verticalScrollbarWidth) + 'px';
    };
    const updateFont = () => editor.applyFontInfo(comments);
    updateFont();
    updateWidth(editor.getLayoutInfo());
    updateZone();

    const resizeObserver = new ResizeObserver(updateZone);
    resizeObserver.observe(comments);
    const subscriptions = [
      editor.onDidChangeModelContent(updateZone),
      editor.onDidLayoutChange(updateWidth),
      editor.onDidChangeConfiguration(updateFont),
      editor.onDidChangeModel(() => {
        zoneId = undefined;
        updateZone();
      }),
      editor.onDidDispose(() => { disposed = true; }),
    ];
    return () => {
      resizeObserver.disconnect();
      subscriptions.forEach(subscription => subscription.dispose());
      if (zoneId && !disposed) editor.changeViewZones(accessor => accessor.removeZone(zoneId));
    };
  }, [atStart, editorRef, editorMountVersion, text]);
}

export function useSharedCodePreview(editorRef, editorMountVersion, enabled) {
  const [text, setText] = useState('');
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!enabled || !editor) return;
    const read = () => setText(editor.getValue());
    const content = editor.onDidChangeModelContent(read);
    const model = editor.onDidChangeModel(read);
    read();
    return () => {
      content.dispose();
      model.dispose();
    };
  }, [editorRef, editorMountVersion, enabled]);
  return text;
}
