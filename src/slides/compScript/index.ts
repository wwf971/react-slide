import { getTitleCompScript, resolveTitleCompScript } from './title';

const getAvailableCompScripts = () => {
  return [getTitleCompScript()];
};

const resolveCompScriptPayload = (scriptInput) => {
  const matchedScriptPayload = resolveTitleCompScript(scriptInput);
  if (matchedScriptPayload) return matchedScriptPayload;
  return null;
};

export { getAvailableCompScripts, resolveCompScriptPayload };
