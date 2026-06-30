import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      closeButton
      position="bottom-center"
      icons={{
        success: null,
        error: null,
        info: null,
        warning: null,
        close: <span aria-hidden="true">x</span>,
      }}
      toastOptions={{
        duration: 4500,
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-none group-[.toaster]:border-0 group-[.toaster]:px-4 group-[.toaster]:py-3 group-[.toaster]:pr-11 group-[.toaster]:text-xs group-[.toaster]:font-medium group-[.toaster]:shadow-lg",
          success: "group-[.toaster]:bg-foreground group-[.toaster]:text-background",
          error: "group-[.toaster]:bg-destructive group-[.toaster]:text-destructive-foreground",
          info: "group-[.toaster]:bg-foreground group-[.toaster]:text-background",
          warning: "group-[.toaster]:bg-foreground group-[.toaster]:text-background",
          title: "group-[.toast]:text-sm group-[.toast]:font-semibold group-[.toast]:text-white",
          description: "group-[.toast]:text-white/80",
          icon: "hidden",
          closeButton:
            "group-[.toast]:left-auto group-[.toast]:right-2 group-[.toast]:top-2 group-[.toast]:h-6 group-[.toast]:w-6 group-[.toast]:translate-x-0 group-[.toast]:translate-y-0 group-[.toast]:rounded-none group-[.toast]:border-0 group-[.toast]:bg-transparent group-[.toast]:text-white group-[.toast]:opacity-80 group-[.toast]:shadow-none hover:group-[.toast]:bg-white/10 hover:group-[.toast]:text-white",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:rounded-none",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground group-[.toast]:rounded-none",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
