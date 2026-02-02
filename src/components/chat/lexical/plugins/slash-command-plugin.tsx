import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  useBasicTypeaheadTriggerMatch,
} from "@lexical/react/LexicalTypeaheadMenuPlugin";
import {
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  TextNode,
} from "lexical";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";
import { SLASH_COMMANDS, type SlashCommand } from "@/shared/slash-commands";

class CommandOption extends MenuOption {
  command: SlashCommand;

  constructor(command: SlashCommand) {
    super(command.name);
    this.command = command;
  }
}

type SlashCommandPluginProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  onMenuOpenChange?: (isOpen: boolean) => void;
};

export function SlashCommandPlugin({
  containerRef,
  onMenuOpenChange,
}: SlashCommandPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [queryString, setQueryString] = useState<string | null>(null);

  const selectOptionRef = useRef<((option: CommandOption) => void) | null>(
    null
  );
  const selectedIndexRef = useRef<number | null>(null);
  const optionsRef = useRef<CommandOption[]>([]);

  const checkForTriggerMatch = useBasicTypeaheadTriggerMatch("/", {
    minLength: 0,
  });

  const options = useMemo(() => {
    if (queryString === null) return [];

    const query = queryString.toLowerCase();
    return SLASH_COMMANDS.filter((cmd) =>
      cmd.name.toLowerCase().startsWith(query)
    ).map((cmd) => new CommandOption(cmd));
  }, [queryString]);

  optionsRef.current = options;

  const isMenuOpen = queryString !== null && options.length > 0;

  useEffect(() => {
    onMenuOpenChange?.(isMenuOpen);
  }, [isMenuOpen, onMenuOpenChange]);

  useEffect(() => {
    return editor.registerCommand(
      KEY_ENTER_COMMAND,
      (event: KeyboardEvent | null) => {
        if (!isMenuOpen) return false;

        const currentOptions = optionsRef.current;
        const currentIndex = selectedIndexRef.current;
        const selectFn = selectOptionRef.current;

        if (
          currentOptions.length > 0 &&
          currentIndex !== null &&
          currentIndex >= 0 &&
          currentIndex < currentOptions.length &&
          selectFn
        ) {
          event?.preventDefault();
          selectFn(currentOptions[currentIndex]);
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );
  }, [editor, isMenuOpen]);

  const onSelectOption = useCallback(
    (
      option: CommandOption,
      textNodeContainingQuery: TextNode | null,
      closeMenu: () => void
    ) => {
      editor.update(() => {
        if (textNodeContainingQuery) {
          const cmd = option.command;
          const text = `/${cmd.name} `;
          textNodeContainingQuery.setTextContent(text);
          textNodeContainingQuery.selectEnd();
        }
      });
      closeMenu();
    },
    [editor]
  );

  return (
    <LexicalTypeaheadMenuPlugin
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForTriggerMatch}
      options={options}
      menuRenderFn={(
        _anchorElementRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        selectedIndexRef.current = selectedIndex;
        selectOptionRef.current = selectOptionAndCleanUp;

        return containerRef.current && options.length > 0
          ? createPortal(
              <SlashCommandMenu
                options={options}
                selectedIndex={selectedIndex}
                onSelect={selectOptionAndCleanUp}
                onHover={setHighlightedIndex}
              />,
              containerRef.current
            )
          : null;
      }}
    />
  );
}

type SlashCommandMenuProps = {
  options: CommandOption[];
  selectedIndex: number | null;
  onSelect: (option: CommandOption) => void;
  onHover: (index: number) => void;
};

function SlashCommandMenu({
  options,
  selectedIndex,
  onSelect,
  onHover,
}: SlashCommandMenuProps) {
  return (
    <div className="absolute bottom-full left-0 mb-1 z-50">
      <div className="border bg-popover text-popover-foreground shadow-md min-w-[280px]">
        <div className="text-muted-foreground px-2 py-1.5 text-xs">
          Commands
        </div>
        {options.map((option, i) => (
          <div
            key={option.command.name}
            onClick={() => onSelect(option)}
            onMouseEnter={() => onHover(i)}
            className={cn(
              "flex items-center gap-2 px-2 py-2 text-xs cursor-pointer",
              selectedIndex === i && "bg-muted"
            )}
          >
            <span className="font-mono">/{option.command.name}</span>
            {option.command.args && (
              <span className="text-muted-foreground">
                {option.command.args}
              </span>
            )}
            <span className="text-muted-foreground ml-auto">
              {option.command.description}
            </span>
          </div>
        ))}
        <div className="border-t text-muted-foreground px-2 py-1.5 text-xs">
          ↑↓ navigate · ↵ select
        </div>
      </div>
    </div>
  );
}
