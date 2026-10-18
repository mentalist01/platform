import React from 'react';
import StudentContact from './StudentContact';
import StudentParentContact from './StudentParentContact';

export default function StudentContactLinks({ studentId, studentName = '' }) {
  return <div className="student-contact-links">
    <StudentContact studentId={studentId} studentName={studentName} compact />
    <StudentParentContact studentId={studentId} studentName={studentName} compact />
  </div>;
}
