import ExpoModulesCore
import UIKit
import Vision

// Apple Vision text reading that keeps where each word sits on the page, so tables can be rebuilt row by row.
// Returns lines (as before, for VIN scan, van sheet and notes) and words with pixel boxes, top-left origin.
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

          var lines: [String] = []
          var words: [[String: Any]] = []
          let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
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
              words.append([
                "t": String(text[start..<i]),
                "x": Double(rect.minX) * width,
                "y": (1.0 - Double(rect.maxY)) * height,
                "w": Double(rect.width) * width,
                "h": Double(rect.height) * height,
              ])
            }
          }
          promise.resolve(["width": width, "height": height, "lines": lines, "words": words])
        } catch {
          promise.reject("ERR_VSA_TEXT_READ", error.localizedDescription)
        }
      }
    }
  }
}
