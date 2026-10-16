import {isGroupHomeworkTrackAllowed} from '../src/utils/groupHomeworkTracks.js';
const time = value => Date.parse(String(value || ''));

// Recipient snapshots grant access to history, not a continuing obligation
// after leaving a group. Work already due before departure keeps its result.
export function isGroupHomeworkRequired(homework, group, studentId) {
  if (homework?.source !== 'learning-group') return true;
  if (homework.learningHomeworkCancelledAt || homework.learningHomeworkTrackExcluded || !group || group.deletedAt) return false;
  const member = group.members?.find(item => item.studentId === studentId);
  if (!member) return false;
  if (!isGroupHomeworkTrackAllowed(homework, member)) return false;
  if (member.status === 'active') return true;
  const left = time(member.leftAt), due = time(homework.dueAt), issued = time(homework.issuedAt);
  return Number.isFinite(left) && Number.isFinite(due) && Number.isFinite(issued)
    && issued <= due && due < left;
}

export function groupHomeworkMembershipProjection(homework, group, studentId, assignmentStatus) {
  const member = group?.members?.find(item => item.studentId === studentId);
  const endedAt = member?.status === 'active' ? '' : member?.leftAt || '';
  const trackExcluded = !isGroupHomeworkTrackAllowed(homework, member);
  const cancelledAt = homework.learningHomeworkCancelledAt
    || (trackExcluded ? member?.homeworkStudyTrackUpdatedAt || group?.updatedAt || homework.issuedAt : '')
    || (!isGroupHomeworkRequired(homework, group, studentId) ? endedAt : '');
  return {
    learningMembershipEndedAt: endedAt,
    learningHomeworkCancelledAt: cancelledAt,
    learningAssignmentStatus: member?.status === 'active' && !cancelledAt && !trackExcluded && !homework.learningHomeworkTrackExcluded ? assignmentStatus : 'closed',
    ...(trackExcluded || homework.learningHomeworkTrackExcluded ? {learningHomeworkTrackExcluded: true} : {}),
  };
}
