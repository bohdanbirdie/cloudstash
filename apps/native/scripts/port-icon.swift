// Draws the dev server's port onto the bottom of Cloudstash Dev's icon as a red counter, the way
// macOS draws an app's notification badge, so each worktree's copy shows its port on the Dock.
// (The Dock draws an app's own badge only once the person allows that copy notifications.)
// scripts/run.sh runs it:
//   swift scripts/port-icon.swift <icon.icns> <label> <out.png>
import AppKit

let args = CommandLine.arguments
guard args.count == 4, let icon = NSImage(contentsOfFile: args[1]) else {
    FileHandle.standardError.write("usage: port-icon.swift <icon.icns> <label> <out.png>\n".data(using: .utf8)!)
    exit(1)
}
let label = args[2] as NSString
let side = 1024.0
let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(side), pixelsHigh: Int(side), bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
icon.draw(in: NSRect(x: 0, y: 0, width: side, height: side))

let height = 230.0
var size = 150.0
func attributes(_ size: Double) -> [NSAttributedString.Key: Any] {
    [.font: NSFont.monospacedDigitSystemFont(ofSize: size, weight: .medium), .foregroundColor: NSColor.white]
}
while label.size(withAttributes: attributes(size)).width > 620 && size > 60 { size -= 4 }
let text = label.size(withAttributes: attributes(size))
let width = max(height, text.width + height * 0.7)
let pill = NSRect(x: (side - width) / 2, y: 125, width: width, height: height)

NSGraphicsContext.saveGraphicsState()
let shadow = NSShadow()
shadow.shadowColor = NSColor(calibratedWhite: 0, alpha: 0.3)
shadow.shadowBlurRadius = 14
shadow.shadowOffset = NSSize(width: 0, height: -4)
shadow.set()
// The Mac app's destructive fill (src/theme.rs, light).
NSColor(srgbRed: 0.901, green: 0.261, blue: 0.264, alpha: 1).setFill()
NSBezierPath(roundedRect: pill, xRadius: height / 2, yRadius: height / 2).fill()
NSGraphicsContext.restoreGraphicsState()

label.draw(at: NSPoint(x: pill.midX - text.width / 2, y: pill.midY - text.height / 2), withAttributes: attributes(size))
NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[3]))
