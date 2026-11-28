"use client";

import { Circle, X } from "lucide-react";
import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { xoBoard, xoSize, xoWinningLine, XO_BOARD_SIZE, type Mark, type XoRoom } from "../lib/games";
import { Button } from "./ui";

const columns = [..."ABCDEFGHIJKLMNOPQRST"];
const arrows: Readonly<Record<string, readonly [number, number]>> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

function coordinates(cell: number, size: number) {
  return columns[cell % size] + (Math.floor(cell / size) + 1);
}

function cellButton(viewport: HTMLDivElement | null, cell: number) {
  return viewport?.querySelector<HTMLButtonElement>('[data-xo-cell="' + cell + '"]');
}

function centerCell(viewport: HTMLDivElement | null, cell: number) {
  const button = cellButton(viewport, cell);
  if (!viewport || !button) return;
  const viewportBounds = viewport.getBoundingClientRect();
  const cellBounds = button.getBoundingClientRect();
  viewport.scrollTo(
    viewport.scrollLeft + cellBounds.left - viewportBounds.left - (viewport.clientWidth - cellBounds.width) / 2,
    viewport.scrollTop + cellBounds.top - viewportBounds.top - (viewport.clientHeight - cellBounds.height) / 2,
  );
  return button;
}

export default function XoBoard({ room, canPlay, onMove }: {
  room: XoRoom; canPlay: boolean; onMove: (cell: number) => void;
}) {
  const size = xoSize(room);
  const large = size === XO_BOARD_SIZE;
  const board = xoBoard(room.moves, size);
  const latest = room.moves.at(-1);
  const winLine = xoWinningLine(board, size, latest);
  const [start] = useState(latest ?? size * Math.floor(size / 2) + Math.floor(size / 2));
  const viewport = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(start);

  useLayoutEffect(() => {
    if (large) centerCell(viewport.current, start);
  }, [large, start]);

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const step = arrows[event.key];
    if (!step || !(event.target instanceof HTMLButtonElement) || event.target.dataset.xoCell === undefined) return;
    event.preventDefault();
    const cell = Number(event.target.dataset.xoCell);
    const row = Math.min(size - 1, Math.max(0, Math.floor(cell / size) + step[0]));
    const column = Math.min(size - 1, Math.max(0, cell % size + step[1]));
    cellButton(viewport.current, row * size + column)?.focus();
  }

  function renderCell(mark: Mark | null, cell: number) {
    const disabled = !canPlay || !!mark;
    return <button key={cell} type="button"
      aria-label={"Ô " + (large ? coordinates(cell, size) : cell + 1) + ", " + (mark ?? "trống")}
      aria-disabled={large && disabled ? true : undefined}
      disabled={!large && disabled}
      tabIndex={large ? focused === cell ? 0 : -1 : undefined}
      data-xo-cell={cell}
      data-mark={mark ?? undefined}
      data-latest={large && cell === latest ? true : undefined}
      data-win={winLine?.includes(cell) || undefined}
      onFocus={large ? () => setFocused(cell) : undefined}
      onClick={() => { if (!disabled) onMove(cell); }}>
      {mark === "X" ? <X aria-hidden="true" /> : mark === "O" ? <Circle aria-hidden="true" /> : null}
    </button>;
  }

  if (!large) return <div className="xo-board" aria-label="Bàn cờ XO">{board.map(renderCell)}</div>;

  return <div className="xo-expanded">
    <div className="xo-grid-help">
      <span>Vuốt để xem các ô khác</span>
      {latest !== undefined && <Button variant="secondary" onClick={() => {
        centerCell(viewport.current, latest)?.focus({ preventScroll: true });
      }}>Nước cuối {coordinates(latest, size)}</Button>}
    </div>
    <div ref={viewport} className="xo-grid-viewport" role="region"
      aria-label={"Bàn cờ XO " + size + " × " + size} onKeyDown={navigate}>
      <div className="xo-grid" style={{ "--xo-size": size } as CSSProperties}>
        <span className="xo-grid-axis" data-axis="corner" aria-hidden="true" />
        {columns.slice(0, size).map(column => <span key={column} className="xo-grid-axis" data-axis="column" aria-hidden="true">{column}</span>)}
        {Array.from({ length: size }, (_, row) => (
          <Fragment key={row}>
            <span className="xo-grid-axis" data-axis="row" aria-hidden="true">{row + 1}</span>
            {board.slice(row * size, (row + 1) * size).map((mark, column) => renderCell(mark, row * size + column))}
          </Fragment>
        ))}
      </div>
    </div>
  </div>;
}
