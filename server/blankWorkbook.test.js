import test from 'node:test';import assert from 'node:assert/strict';
import { BLANK_WORKBOOK_ODS, workbookSolutionFormatAllowed } from './blankWorkbook.js';
test('new text-task workbook has an uncompressed ODF MIME entry before its content',()=>{
 const b=BLANK_WORKBOOK_ODS;
 assert.equal(b.readUInt32LE(0),0x04034b50);assert.equal(b.readUInt16LE(8),0);
 assert.equal(b.subarray(30,38).toString(),'mimetype');
 assert.equal(b.subarray(38,38+b.readUInt32LE(18)).toString(),'application/vnd.oasis.opendocument.spreadsheet');
 assert.ok(b.includes(Buffer.from('content.xml')));assert.ok(b.includes(Buffer.from('META-INF/manifest.xml')));
});
test('only flat to packaged ODF is allowed in addition to the original format',()=>{
 assert.equal(workbookSolutionFormatAllowed('.fods','.ods'),true);
 assert.equal(workbookSolutionFormatAllowed('.ods','.ods'),true);
 for(const pair of [['.xlsx','.ods'],['.fods','.xlsm'],['.ods','.fods'],['.xls','.xlsx']]) assert.equal(workbookSolutionFormatAllowed(...pair),false);
});
