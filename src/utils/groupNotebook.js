const safe=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(value);
export const groupNotebookBoard=groupId=>safe(groupId)?`board-group-${groupId}`:null;
export const groupNotebookCode=(groupId,studentId='')=>safe(groupId)&&(!studentId||safe(studentId))?`collab-group-${groupId}${studentId?`~student~${studentId}`:''}`:null;
