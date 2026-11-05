import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useContainer } from '@/presentation/providers/ContainerProvider';

const PASSCODE_STATUS_KEY = ['passcode-status'] as const;

export function usePasscodeStatus() {
  const { auth } = useContainer();
  return useQuery({
    queryKey: PASSCODE_STATUS_KEY,
    queryFn: ({ signal }) => auth.getPasscodeStatus.execute(signal),
  });
}

export function useChangePasscode() {
  const { auth } = useContainer();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: auth.changePasscode.execute.bind(auth.changePasscode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PASSCODE_STATUS_KEY }),
  });
}
