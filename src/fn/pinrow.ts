import { z } from "zod"
import { length, rotation, type AnySoupElement } from "circuit-json"
import { platedhole } from "../helpers/platedhole"
import { silkscreenRef, type SilkscreenRef } from "src/helpers/silkscreenRef"
import { silkscreenPin } from "src/helpers/silkscreenPin"

export const pinrow_def = z
  .object({
    fn: z.string(),
    num_pins: z.number().optional().default(6),
    rows: z
      .union([z.string(), z.number()])
      .transform((val) => Number(val))
      .optional()
      .default(1)
      .describe("number of rows"),
    p: length.default("0.1in").describe("pitch"),
    id: length.default("1.0mm").describe("inner diameter"),
    od: length.default("1.5mm").describe("outer diameter"),
    male: z.boolean().optional().describe("for male pin headers"),
    female: z.boolean().optional().describe("for female pin headers"),
    labelrotation: z.enum(["0", "90", "180", "270"]).optional().default("0"),
    labelposition: z
      .enum(["Up", "Down", "Left", "Right"])
      .optional()
      .default("Up"),
  })
  .transform((data) => ({
    ...data,
    labelrotation: Number(data.labelrotation),
    male: data.male ?? (data.female ? false : true),
    female: data.female ?? false,
  }))
  .superRefine((data, ctx) => {
    if (data.male && data.female) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "'male' and 'female' cannot both be true; it should be male or female.",
        path: ["male", "female"],
      })
    }
  })

export const pinrow = (
  raw_params: z.input<typeof pinrow_def>,
): { circuitJson: AnySoupElement[]; parameters: any } => {
  const parameters = pinrow_def.parse(raw_params)
  const { p, id, od, rows, num_pins, labelrotation, labelposition } = parameters

  const holes: AnySoupElement[] = []
  const numPinsPerRow = Math.ceil(num_pins / rows)
  const ySpacing = -p

  const calculateAnchorPosition = (
    xoff: number,
    yoff: number,
    od: number,
    labelposition: "Up" | "Down" | "Left" | "Right",
  ): { anchor_x: number; anchor_y: number } => {
    let dx = 0,
      dy = 0
    const offset = od * 0.75
    switch (labelposition) {
      case "Right":
        dx = offset
        dy = 0
        break
      case "Up":
        dx = 0
        dy = -offset
        break
      case "Down":
        dx = 0
        dy = offset
        break
      case "Left":
        dx = -offset
        dy = 0
        break
      default:
        dx = 0
        dy = 0
    }
    return { anchor_x: xoff + dx, anchor_y: yoff + dy }
  }

  // Helper to add plated hole and silkscreen label
  const addPin = (pinNumber: number, xoff: number, yoff: number) => {
    holes.push(platedhole(pinNumber, xoff, yoff, id, od))
    const { anchor_x, anchor_y } = calculateAnchorPosition(
      xoff,
      yoff,
      od,
      labelposition,
    )
    holes.push(
      silkscreenPin({
        fs: od / 5,
        pn: pinNumber,
        rotation: labelrotation,
        anchor_x,
        anchor_y,
        labelposition: labelposition,
      }),
    )
  }

  // Track used positions to prevent overlaps
  const usedPositions = new Set<string>()

  // Check if BGA-style numbering should be used
  const useBGAStyle = rows > 2 && numPinsPerRow > 2

  if (rows === 1) {
    // Single row: left to right, pin 1 to num_pins
    const xStart = -((num_pins - 1) / 2) * p
    for (let i = 0; i < num_pins; i++) {
      const pinNumber = i + 1
      const xoff = xStart + i * p
      const posKey = `${xoff},${0}`
      if (usedPositions.has(posKey)) throw new Error(`Overlap at ${posKey}`)
      usedPositions.add(posKey)
      addPin(pinNumber, xoff, 0)
    }
  } else if (useBGAStyle) {
    // BGA-style: row-major numbering (left to right, top to bottom)
    const xStart = -((numPinsPerRow - 1) / 2) * p
    let currentPin = 1
    for (let row = 0; row < rows && currentPin <= num_pins; row++) {
      for (let col = 0; col < numPinsPerRow && currentPin <= num_pins; col++) {
        const xoff = xStart + col * p
        const yoff = row * ySpacing
        const posKey = `${xoff},${yoff}`
        if (usedPositions.has(posKey)) throw new Error(`Overlap at ${posKey}`)
        usedPositions.add(posKey)
        addPin(currentPin++, xoff, yoff)
      }
    }
  } else {
    // Multi-row: counterclockwise spiral traversal
    const xStart = -((numPinsPerRow - 1) / 2) * p
    let currentPin = 1
    let top = 0
    let bottom = rows - 1
    let left = 0
    let right = numPinsPerRow - 1

    while (currentPin <= num_pins && top <= bottom && left <= right) {
      // Left column: top to bottom
      for (let row = top; row <= bottom && currentPin <= num_pins; row++) {
        const xoff = xStart + left * p
        const yoff = row * ySpacing
        const posKey = `${xoff},${yoff}`
        if (usedPositions.has(posKey)) throw new Error(`Overlap at ${posKey}`)
        usedPositions.add(posKey)
        addPin(currentPin++, xoff, yoff)
      }
      left++

      // Bottom row: left to right
      for (let col = left; col <= right && currentPin <= num_pins; col++) {
        const xoff = xStart + col * p
        const yoff = bottom * ySpacing
        const posKey = `${xoff},${yoff}`
        if (usedPositions.has(posKey)) throw new Error(`Overlap at ${posKey}`)
        usedPositions.add(posKey)
        addPin(currentPin++, xoff, yoff)
      }
      bottom--

      if (left <= right) {
        // Right column: bottom to top
        for (let row = bottom; row >= top && currentPin <= num_pins; row--) {
          const xoff = xStart + right * p
          const yoff = row * ySpacing
          const posKey = `${xoff},${yoff}`
          if (usedPositions.has(posKey)) throw new Error(`Overlap at ${posKey}`)
          usedPositions.add(posKey)
          addPin(currentPin++, xoff, yoff)
        }
        right--
      }

      if (top <= bottom) {
        // Top row: right to left
        for (let col = right; col >= left && currentPin <= num_pins; col--) {
          const xoff = xStart + col * p
          const yoff = top * ySpacing
          const posKey = `${xoff},${yoff}`
          if (usedPositions.has(posKey)) throw new Error(`Overlap at ${posKey}`)
          usedPositions.add(posKey)
          addPin(currentPin++, xoff, yoff)
        }
        top++
      }
    }

    // Verify all pins were assigned
    if (currentPin - 1 < num_pins) {
      throw new Error(
        `Missing pins: assigned ${currentPin - 1}, expected ${num_pins}`,
      )
    }
  }

  // Add centered silkscreen reference text
  const refText: SilkscreenRef = silkscreenRef(0, p, 0.5)

  return {
    circuitJson: [...holes, refText],
    parameters,
  }
}
