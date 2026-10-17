import CoreGraphics

extension CGRect {
  var toNitroRect: TextRect {
    return TextRect(left: minX, right: maxX, top: minY, bottom: maxY)
  }
}

extension Array where Element == NSValue {
  var toNitroPoints: [TextPoint] {
    return map { value in
      let point = value.cgPointValue
      return TextPoint(x: point.x, y: point.y)
    }
  }
}
