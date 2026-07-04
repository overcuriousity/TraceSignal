import * as Toast from "@radix-ui/react-toast";

export const ToastProvider = Toast.Provider;
export const ToastViewport = () => (
  <Toast.Viewport className="fixed bottom-4 right-4 z-[200] flex max-h-screen w-80 flex-col gap-2 p-0 outline-none" />
);
