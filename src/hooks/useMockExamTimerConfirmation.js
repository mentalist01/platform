import { useCallback, useEffect, useRef, useState } from 'react';

const useMockExamTimerConfirmation = () => {
  const [confirmationRequest, setConfirmationRequest] = useState(null);
  const resolverRef = useRef(null);
  const requestCounterRef = useRef(0);

  const requestTimerConfirmation = useCallback((options = {}) => new Promise((resolve) => {
    resolverRef.current?.(false);
    resolverRef.current = resolve;
    requestCounterRef.current += 1;
    setConfirmationRequest({
      id: requestCounterRef.current,
      kind: 'start',
      ...options,
    });
  }), []);

  const settleTimerConfirmation = useCallback((confirmed) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setConfirmationRequest(null);
    resolve?.(Boolean(confirmed));
  }, []);

  useEffect(() => () => {
    resolverRef.current?.(false);
    resolverRef.current = null;
  }, []);

  return {
    confirmationRequest,
    requestTimerConfirmation,
    confirmTimerAction: useCallback(() => settleTimerConfirmation(true), [settleTimerConfirmation]),
    cancelTimerAction: useCallback(() => settleTimerConfirmation(false), [settleTimerConfirmation]),
  };
};

export default useMockExamTimerConfirmation;
