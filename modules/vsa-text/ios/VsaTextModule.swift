import ExpoModulesCore
import UIKit
import Vision

// Apple Vision text reading that keeps where each word sits on the page, so tables can be rebuilt row by row.
// Returns lines (as before, for VIN scan, van sheet and notes) and words with pixel boxes, top-left origin.
// Second pass ("extra"): the full-page read drops small isolated numerals (deck digits, amounts in narrow cells;
// found on the phone 2026-10-05). Reading enlarged, overlapping tiles brings them back. The app (src/app/layout.ts,
// addMissedNumerals) keeps only numerals from it, and only where the full-page read found no word.
public class VsaTextModule: Module {
  public func definition() -> ModuleDefinition {
    Name("VsaText")

    AsyncFunction("read") { (url: URL, correct: Bool, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let data = try Data(contentsOf: url)
          guard let cgImage = UIImage(data: data)?.cgImage else {
            promise.reject("ERR_VSA_TEXT_IMAGE", "The photo could not be opened.")
            return
          }
          let width = Double(cgImage.width)
          let height = Double(cgImage.height)

          let request = VNRecognizeTextRequest()
          request.recognitionLevel = .accurate
          request.usesLanguageCorrection = correct // off for paperwork: numbers and codes are never "corrected"
          try VNImageRequestHandler(cgImage: cgImage, options: [:]).perform([request])

          let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
          let page = VsaTextModule.collect(observations, ox: 0, oy: 0, w: width, h: height, confidence: false)
          let extra = VsaTextModule.tileWords(cgImage)
          promise.resolve(["width": width, "height": height, "lines": page.lines, "words": page.words, "extra": extra])
        } catch {
          promise.reject("ERR_VSA_TEXT_READ", error.localizedDescription)
        }
      }
    }
  }

  // Words with boxes. The box of each word is in the pixels of the area it was read from, moved by (ox, oy).
  private static func collect(_ observations: [VNRecognizedTextObservation], ox: Double, oy: Double, w: Double, h: Double, confidence: Bool) -> (lines: [String], words: [[String: Any]]) {
    var lines: [String] = []
    var words: [[String: Any]] = []
    for observation in observations {
      guard let top = observation.topCandidates(1).first else { continue }
      let text = top.string
      lines.append(text)
      var i = text.startIndex
      while i < text.endIndex {
        while i < text.endIndex && text[i].isWhitespace { i = text.index(after: i) }
        let start = i
        while i < text.endIndex && !text[i].isWhitespace { i = text.index(after: i) }
        if start == i { continue }
        let rect: CGRect
        if let box = try? top.boundingBox(for: start..<i) {
          rect = box.boundingBox
        } else {
          rect = observation.boundingBox
        }
        var word: [String: Any] = [
          "t": String(text[start..<i]),
          "x": ox + Double(rect.minX) * w,
          "y": oy + (1.0 - Double(rect.maxY)) * h,
          "w": Double(rect.width) * w,
          "h": Double(rect.height) * h,
        ]
        if confidence { word["c"] = Double(top.confidence) }
        words.append(word)
      }
    }
    return (lines, words)
  }

  // 3 x 4 overlapping tiles, each enlarged 2x on white, read with the same settings. Never fails the read:
  // a tile that cannot be cropped or read is skipped.
  private static func tileWords(_ cgImage: CGImage) -> [[String: Any]] {
    let width = cgImage.width
    let height = cgImage.height
    let cols = 3
    let rows = 4
    let tw = Int(Double(width) * 0.45)
    let th = Int(Double(height) * 0.32)
    var out: [[String: Any]] = []
    for r in 0..<rows {
      for c in 0..<cols {
        let ox = c * (width - tw) / (cols - 1)
        let oy = r * (height - th) / (rows - 1)
        // One tile at a time inside its own pool: the enlarged copies are large and are released before the next tile.
        autoreleasepool {
          out.append(contentsOf: readTile(cgImage, ox: ox, oy: oy, tw: tw, th: th))
        }
      }
    }
    return out
  }

  private static func readTile(_ cgImage: CGImage, ox: Int, oy: Int, tw: Int, th: Int) -> [[String: Any]] {
    guard let crop = cgImage.cropping(to: CGRect(x: Double(ox), y: Double(oy), width: Double(tw), height: Double(th))) else { return [] }
    let size = CGSize(width: Double(tw * 2), height: Double(th * 2))
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let big = UIGraphicsImageRenderer(size: size, format: format).image { context in
      UIColor.white.setFill()
      context.fill(CGRect(origin: .zero, size: size))
      UIImage(cgImage: crop).draw(in: CGRect(origin: .zero, size: size))
    }
    guard let bigImage = big.cgImage else { return [] }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    do {
      try VNImageRequestHandler(cgImage: bigImage, options: [:]).perform([request])
    } catch {
      return []
    }
    let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
    return collect(observations, ox: Double(ox), oy: Double(oy), w: Double(tw), h: Double(th), confidence: true).words
  }
}
