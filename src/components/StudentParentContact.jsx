import React from 'react';
import StudentContact from './StudentContact';

export default function StudentParentContact(props) {
  return <StudentContact {...props} kind="parent" />;
}
