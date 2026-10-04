import { cn } from '@/lib/utils';
import { Platform, TextInput } from 'react-native';

/*
 * Diverges from the registry copy: the upstream Uniwind variant still
 * destructures a `placeholderClassName` prop, which is a NativeWind concept
 * that Uniwind implements in neither its types nor its runtime
 * (founded-labs/react-native-reusables#544). It was accepted and discarded, so
 * removing it drops a prop that never did anything rather than changing
 * behaviour. Placeholder colour is set by the `placeholder:` variant below.
 */
function Input({
  className,
  ...props
}: React.ComponentProps<typeof TextInput> & React.RefAttributes<TextInput>) {
  return (
    <TextInput
      className={cn(
        'dark:bg-input/30 border-input bg-background text-foreground flex h-10 w-full min-w-0 flex-row items-center rounded-md border px-3 py-1 text-base leading-5 shadow-sm shadow-black/5 sm:h-9',
        props.editable === false &&
          cn(
            'opacity-50',
            Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
          ),
        Platform.select({
          web: cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow] md:text-sm',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'
          ),
          native: 'placeholder:text-muted-foreground/50',
        }),
        className
      )}
      {...props}
    />
  );
}

export { Input };
