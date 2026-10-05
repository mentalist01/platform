import { getActiveLearningGroupMembers } from './learningGroups.js';
import { subscriptionBlockState } from './learningSubscriptions.js';
import { getRutubeEmbedUrl } from '../src/utils/learningGroups.js';

export function groupLibraryEntitlement(student, groups, blocks, lessons, now = Date.now()) {
  if (!student || student.deletedAt) return false;
  const own = groups.filter(group => group.teacherId === student.teacherId && !group.deletedAt && group.status !== 'completed'
    && getActiveLearningGroupMembers(group).some(member => member.studentId === student.id));
  return own.some(group => {
    const purchases = blocks.filter(block => block.teacherId === student.teacherId && block.studentId === student.id && block.groupId === group.id);
    if (!purchases.length) return true; // The original per-lesson groups retain their benefits and price.
    return purchases.some(block => block.tariff.kind === 'group' && subscriptionBlockState(block, lessons, now).status === 'active');
  });
}

export function groupLibraryCatalog(student, groups, lessons, jobs, materials, live = () => false) {
  const visibleGroups = groups.filter(group => group.teacherId === student.teacherId && !group.deletedAt);
  const byGroup = new Map(visibleGroups.map(group => [group.id, group]));
  const ownIds = new Set(visibleGroups.filter(group => getActiveLearningGroupMembers(group).some(member => member.studentId === student.id)).map(group => group.id));
  const videosByLesson = new Map();
  const append = (lessonId, url, title, order) => {
    const embedUrl = getRutubeEmbedUrl(url);
    if (!embedUrl || !lessonId) return;
    const list = videosByLesson.get(lessonId) || [];
    if (!list.some(item => item.embedUrl === embedUrl)) list.push({ url, embedUrl, title, order });
    videosByLesson.set(lessonId, list);
  };
  for (const job of jobs) if (job.teacherId === student.teacherId && job.status === 'ready' && job.occurrence?.scope === 'learning-group') {
    append(job.occurrence.lessonId, job.video?.url, job.lessonName || job.title, job.startedAt || 0);
  }
  for (const material of materials) if (material.teacherId === student.teacherId && !material.deletedAt && material.kind === 'video' && material.visibility === 'lesson'
    && byGroup.has(material.groupId)) append(material.lessonId, material.url, material.title, Date.parse(material.createdAt) || 0);
  const entries = lessons.filter(lesson => byGroup.has(lesson.groupId) && lesson.teacherId === student.teacherId && lesson.status !== 'cancelled').map(lesson => ({
    id: lesson.id, groupId: lesson.groupId, groupName: byGroup.get(lesson.groupId).name,
    topic: lesson.topic || 'Занятие группы', startAt: lesson.startAt, durationMinutes: lesson.durationMinutes,
    status: lesson.status, ownGroup: ownIds.has(lesson.groupId), canListen: !ownIds.has(lesson.groupId) && live(lesson),
    recordingParts: (videosByLesson.get(lesson.id) || []).sort((a, b) => a.order - b.order).map(({ order, ...video }) => video),
  }));
  return { groups: visibleGroups.map(group => ({ id: group.id, name: group.name })),
    lessons: entries.filter(lesson => !lesson.ownGroup && (lesson.canListen || Date.parse(lesson.startAt) >= Date.now())).sort((a, b) => a.startAt.localeCompare(b.startAt)),
    recordings: entries.filter(lesson => lesson.recordingParts.length).sort((a, b) => b.startAt.localeCompare(a.startAt)) };
}

// An authenticated listener must never negotiate outgoing media or a data channel.
export function listenerSignalAllowed(signal) {
  if (!signal || typeof signal !== 'object' || Array.isArray(signal)) return false;
  if (Object.keys(signal).some(key => !['description', 'candidate', 'control'].includes(key))) return false;
  if (Object.hasOwn(signal, 'control')) {
    return Object.keys(signal).length === 1 && signal.control?.restartConnection === true
      && signal.control.preferredIceTransportPolicy === 'relay'
      && Object.keys(signal.control).every(key => ['restartConnection', 'preferredIceTransportPolicy'].includes(key));
  }
  if (!Object.hasOwn(signal, 'description')) return Boolean(signal.candidate && typeof signal.candidate === 'object');
  const description = signal.description;
  if (!['offer', 'answer'].includes(description?.type) || typeof description.sdp !== 'string') return false;
  const lines = description.sdp.split(/\r?\n/);
  if (lines[0] !== 'v=0') return false;
  const sections = []; let current = []; const session = current;
  for (const line of lines) { if (line.startsWith('m=')) { current = []; sections.push(current); } current.push(line); }
  const direction = part => part.filter(line => /^a=(?:sendrecv|sendonly|recvonly|inactive)$/.test(line)).map(line => line.slice(2));
  const sessionDirections = direction(session);
  if (sessionDirections.length > 1 || !sections.length) return false;
  return sections.every(section => {
    const [kind, port] = section[0].slice(2).split(/\s+/);
    if (!['audio', 'video'].includes(kind)) return kind === 'application' && port === '0';
    const directions = direction(section);
    return directions.length <= 1 && ['recvonly', 'inactive'].includes(directions[0] || sessionDirections[0] || 'sendrecv');
  });
}
