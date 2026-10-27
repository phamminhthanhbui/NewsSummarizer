const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const files = [
  'src/components/MembershipComparison.tsx',
  'src/providers/AuthProvider.tsx',
  'src/screens/SettingsScreen.tsx',
  'src/screens/ProductScreens.tsx'
];
let failed = false;
for (const name of files) {
  const source = fs.readFileSync(path.join(root, name), 'utf8');
  const result = ts.transpileModule(source, {
    fileName: name,
    reportDiagnostics: true,
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 }
  });
  const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
  console.log(name + ': ' + (errors.length ? 'FAIL' : 'OK'));
  if (errors.length) {
    failed = true;
    for (const error of errors) console.error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  }
}
if (failed) process.exitCode = 1;
