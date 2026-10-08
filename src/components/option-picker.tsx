import { Pressable, ScrollView, View } from "react-native";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Text } from "@/components/ui/text";

export interface PickerOption {
  id: string;
  label: string;
  /** Shown under the label where the choice needs explaining. */
  detail?: string;
}

/**
 * Choosing one of a short list (§19's Provider and Model rows).
 *
 * Picking closes the dialog immediately rather than requiring a confirm. There
 * is nothing to confirm: both choices are reversible, neither sends anything,
 * and a second tap to agree with yourself is the kind of ceremony §3.6 asks us
 * to leave out. Cancel stays, because opening the dialog by accident is real.
 */
export function OptionPicker({
  open,
  onOpenChange,
  title,
  description,
  options,
  selectedId,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  options: PickerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {/*
          Scrollable because a provider's model list is not bounded by anything
          we control — AssemblyAI grew one during PR7.
        */}
        <ScrollView className="max-h-80" contentContainerClassName="py-1">
          {options.map((option) => {
            const isSelected = option.id === selectedId;
            return (
              <Pressable
                key={option.id}
                onPress={() => {
                  onSelect(option.id);
                  onOpenChange(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                className="min-h-[56px] flex-row items-center justify-between gap-3 rounded-md px-3 py-3 active:bg-card"
              >
                <View className="flex-1 gap-1">
                  <Text variant="body">{option.label}</Text>
                  {option.detail ? (
                    <Text variant="caption">{option.detail}</Text>
                  ) : null}
                </View>
                {/*
                  A tick rather than a radio: the selected row is the only one
                  that needs marking, and §31 has the state on the Pressable
                  itself for a screen reader regardless of the glyph.
                */}
                <Text variant="body">{isSelected ? "✓" : " "}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <AlertDialogFooter>
          <AlertDialogCancel>
            <Text>Cancel</Text>
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
