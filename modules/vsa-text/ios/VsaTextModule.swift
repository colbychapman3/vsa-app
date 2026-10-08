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

    // Closer read of single cells the full read skipped (a lone deck digit). Each box is read enlarged on a white margin, at two
    // sizes and both recognition levels; the most confident words come first. The app keeps only numerals, and only where the
    // page read found nothing. A cell that cannot be read adds nothing.
    AsyncFunction("readCells") { (url: URL, rects: [[String: Double]], promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        guard let data = try? Data(contentsOf: url), let cgImage = UIImage(data: data)?.cgImage else {
          promise.resolve([[String: Any]]())
          return
        }
        var out: [[String: Any]] = []
        for r in rects {
          guard let x = r["x"], let y = r["y"], let w = r["w"], let h = r["h"], w > 4, h > 4 else { continue }
          let box = CGRect(x: max(0, x), y: max(0, y), width: w, height: h).intersection(CGRect(x: 0, y: 0, width: Double(cgImage.width), height: Double(cgImage.height)))
          if box.isEmpty { continue }
          var found: [[String: Any]] = []
          for scale in [4.0, 6.0] {
            for level in [VNRequestTextRecognitionLevel.accurate, VNRequestTextRecognitionLevel.fast] {
              autoreleasepool {
                found.append(contentsOf: VsaTextModule.readCell(cgImage, box: box, scale: scale, level: level))
              }
            }
          }
          found.sort { ($0["c"] as? Double ?? 0) > ($1["c"] as? Double ?? 0) }
          out.append(contentsOf: found)
        }
        promise.resolve(out)
      }
    }
  }

  private static func readCell(_ cgImage: CGImage, box: CGRect, scale: Double, level: VNRequestTextRecognitionLevel) -> [[String: Any]] {
    guard let crop = cgImage.cropping(to: box) else { return [] }
    let margin = max(box.width, box.height) * scale * 0.5
    let size = CGSize(width: box.width * scale + 2 * margin, height: box.height * scale + 2 * margin)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let big = UIGraphicsImageRenderer(size: size, format: format).image { context in
      UIColor.white.setFill()
      context.fill(CGRect(origin: .zero, size: size))
      UIImage(cgImage: crop).draw(in: CGRect(x: margin, y: margin, width: box.width * scale, height: box.height * scale))
    }
    guard let bigImage = big.cgImage else { return [] }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = level
    request.usesLanguageCorrection = false
    request.minimumTextHeight = 0
    do { try VNImageRequestHandler(cgImage: bigImage, options: [:]).perform([request]) } catch { return [] }
    let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
    // Boxes come back relative to the whole enlarged picture (margin included): map them back to page pixels.
    var words = collect(observations, ox: 0, oy: 0, w: Double(size.width), h: Double(size.height), confidence: true).words
    for i in words.indices {
      if let wx = words[i]["x"] as? Double, let wy = words[i]["y"] as? Double, let ww = words[i]["w"] as? Double, let wh = words[i]["h"] as? Double {
        words[i]["x"] = Double(box.minX) + (wx - Double(margin)) / scale
        words[i]["y"] = Double(box.minY) + (wy - Double(margin)) / scale
        words[i]["w"] = ww / scale
        words[i]["h"] = wh / scale
      }
    }
    return words
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
