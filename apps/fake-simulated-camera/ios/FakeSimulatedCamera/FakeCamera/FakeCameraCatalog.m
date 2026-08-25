#import "FakeCameraCatalog.h"

NSErrorDomain const FakeCameraErrorDomain = @"com.margelo.fakecamera";

static const NSInteger kSchemaVersion = 1;

@implementation FakeCameraFormatSpec
@end

@implementation FakeCameraDeviceSpec
@end

// MARK: - Validation helpers

/// Thrown internally so every check can abort with a `$.path: message` string; converted to NSError at the boundary.
static NSException *validationFailure(NSString *path, NSString *message) {
  return [NSException exceptionWithName:@"FakeCameraCatalogValidation"
                                 reason:[NSString stringWithFormat:@"%@: %@", path, message]
                               userInfo:nil];
}

static id require(NSDictionary *object, NSString *key, Class cls, NSString *path) {
  id value = object[key];
  NSString *fieldPath = [NSString stringWithFormat:@"%@.%@", path, key];
  if (value == nil || value == [NSNull null]) {
    @throw validationFailure(fieldPath, @"missing");
  }
  if (![value isKindOfClass:cls]) {
    @throw validationFailure(fieldPath, [NSString stringWithFormat:@"expected %@", NSStringFromClass(cls)]);
  }
  return value;
}

static BOOL requireBool(NSDictionary *object, NSString *key, NSString *path) {
  NSNumber *value = require(object, key, [NSNumber class], path);
  if (strcmp(value.objCType, @encode(BOOL)) != 0 && strcmp(value.objCType, @encode(char)) != 0) {
    @throw validationFailure([NSString stringWithFormat:@"%@.%@", path, key], @"expected boolean");
  }
  return value.boolValue;
}

static NSNumber *requireNumber(NSDictionary *object, NSString *key, NSString *path) {
  NSNumber *value = require(object, key, [NSNumber class], path);
  if (strcmp(value.objCType, @encode(BOOL)) == 0 || strcmp(value.objCType, @encode(char)) == 0) {
    @throw validationFailure([NSString stringWithFormat:@"%@.%@", path, key], @"expected number");
  }
  return value;
}

static int32_t requirePositiveInteger(NSDictionary *object, NSString *key, NSString *path) {
  NSNumber *value = requireNumber(object, key, path);
  double doubleValue = value.doubleValue;
  if (doubleValue <= 0 || doubleValue != floor(doubleValue)) {
    @throw validationFailure([NSString stringWithFormat:@"%@.%@", path, key], @"must be a positive integer");
  }
  return (int32_t)doubleValue;
}

static NSArray *requireArray(NSDictionary *object, NSString *key, NSString *path, BOOL nonEmpty) {
  NSArray *value = require(object, key, [NSArray class], path);
  if (nonEmpty && value.count == 0) {
    @throw validationFailure([NSString stringWithFormat:@"%@.%@", path, key], @"must not be empty");
  }
  return value;
}

static NSString *requireString(NSDictionary *object, NSString *key, NSString *path) {
  NSString *value = require(object, key, [NSString class], path);
  if (value.length == 0) {
    @throw validationFailure([NSString stringWithFormat:@"%@.%@", path, key], @"must not be empty");
  }
  return value;
}

static NSString *requireEnum(NSDictionary *object, NSString *key, NSDictionary<NSString *, id> *allowed, NSString *path) {
  NSString *value = requireString(object, key, path);
  if (allowed[value] == nil) {
    NSString *options = [[allowed.allKeys sortedArrayUsingSelector:@selector(compare:)] componentsJoinedByString:@", "];
    @throw validationFailure([NSString stringWithFormat:@"%@.%@", path, key],
                             [NSString stringWithFormat:@"unknown value \"%@\", expected one of %@", value, options]);
  }
  return value;
}

static void requireRange(NSArray *range, NSString *path, double minimum, BOOL allowEqual) {
  if (range.count != 2 || ![range[0] isKindOfClass:[NSNumber class]] || ![range[1] isKindOfClass:[NSNumber class]]) {
    @throw validationFailure(path, @"expected [min, max]");
  }
  double low = [range[0] doubleValue];
  double high = [range[1] doubleValue];
  if (low < minimum) {
    @throw validationFailure([path stringByAppendingString:@"[0]"], [NSString stringWithFormat:@"must be >= %g", minimum]);
  }
  if (allowEqual ? low > high : low >= high) {
    @throw validationFailure(path, [NSString stringWithFormat:@"min %g must not exceed max %g", low, high]);
  }
}

static CMVideoDimensions requireDimensions(id value, NSString *path) {
  if (![value isKindOfClass:[NSArray class]] || [value count] != 2) {
    @throw validationFailure(path, @"expected [width, height]");
  }
  int32_t sides[2];
  for (NSUInteger index = 0; index < 2; index++) {
    id side = value[index];
    NSString *sidePath = [NSString stringWithFormat:@"%@[%lu]", path, (unsigned long)index];
    if (![side isKindOfClass:[NSNumber class]]) {
      @throw validationFailure(sidePath, @"expected number");
    }
    double doubleValue = [side doubleValue];
    if (doubleValue <= 0 || doubleValue != floor(doubleValue)) {
      @throw validationFailure(sidePath, @"must be a positive integer");
    }
    sides[index] = (int32_t)doubleValue;
  }
  return (CMVideoDimensions){sides[0], sides[1]};
}

static void requireUnique(NSArray<NSString *> *values, NSString *path, NSString *what) {
  NSMutableSet *seen = [NSMutableSet set];
  [values enumerateObjectsUsingBlock:^(NSString *value, NSUInteger index, BOOL *stop) {
    if ([seen containsObject:value]) {
      @throw validationFailure([NSString stringWithFormat:@"%@[%lu]", path, (unsigned long)index],
                               [NSString stringWithFormat:@"duplicate %@ \"%@\"", what, value]);
    }
    [seen addObject:value];
  }];
}

// MARK: - Enum tables (VisionCamera's public TypeScript unions)

static NSDictionary<NSString *, NSNumber *> *pixelFormatTable(void) {
  return @{
    @"yuv-420-8-bit-video" : @(kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange),
    @"yuv-420-8-bit-full" : @(kCVPixelFormatType_420YpCbCr8BiPlanarFullRange),
    @"yuv-420-10-bit-video" : @(kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange),
    @"yuv-420-10-bit-full" : @(kCVPixelFormatType_420YpCbCr10BiPlanarFullRange),
    @"yuv-422-8-bit-video" : @(kCVPixelFormatType_422YpCbCr8BiPlanarVideoRange),
    @"yuv-422-8-bit-full" : @(kCVPixelFormatType_422YpCbCr8BiPlanarFullRange),
    @"yuv-422-10-bit-video" : @(kCVPixelFormatType_422YpCbCr10BiPlanarVideoRange),
    @"yuv-422-10-bit-full" : @(kCVPixelFormatType_422YpCbCr10BiPlanarFullRange),
    @"yuv-444-8-bit-video" : @(kCVPixelFormatType_444YpCbCr8BiPlanarVideoRange),
    @"yuv-444-8-bit-full" : @(kCVPixelFormatType_444YpCbCr8BiPlanarFullRange),
    @"rgb-bgra-8-bit" : @(kCVPixelFormatType_32BGRA),
  };
}

static NSDictionary<NSString *, AVCaptureDeviceType> *deviceTypeTable(void) {
  NSMutableDictionary *table = [@{
    @"wide-angle" : AVCaptureDeviceTypeBuiltInWideAngleCamera,
    @"ultra-wide-angle" : AVCaptureDeviceTypeBuiltInUltraWideCamera,
    @"telephoto" : AVCaptureDeviceTypeBuiltInTelephotoCamera,
    @"dual" : AVCaptureDeviceTypeBuiltInDualCamera,
    @"dual-wide" : AVCaptureDeviceTypeBuiltInDualWideCamera,
    @"triple" : AVCaptureDeviceTypeBuiltInTripleCamera,
    @"true-depth" : AVCaptureDeviceTypeBuiltInTrueDepthCamera,
  } mutableCopy];
  if (@available(iOS 15.4, *)) {
    table[@"lidar-depth"] = AVCaptureDeviceTypeBuiltInLiDARDepthCamera;
  }
  if (@available(iOS 17.0, *)) {
    table[@"continuity"] = AVCaptureDeviceTypeContinuityCamera;
    table[@"external"] = AVCaptureDeviceTypeExternal;
  }
  return table;
}

static NSDictionary<NSString *, NSNumber *> *positionTable(void) {
  return @{@"back" : @(AVCaptureDevicePositionBack), @"front" : @(AVCaptureDevicePositionFront)};
}

static NSDictionary<NSString *, NSNumber *> *autoFocusTable(void) {
  return @{
    @"none" : @(AVCaptureAutoFocusSystemNone),
    @"contrast-detection" : @(AVCaptureAutoFocusSystemContrastDetection),
    @"phase-detection" : @(AVCaptureAutoFocusSystemPhaseDetection),
  };
}

static NSDictionary<NSString *, NSNumber *> *stabilizationTable(void) {
  NSMutableDictionary *table = [@{
    @"standard" : @(AVCaptureVideoStabilizationModeStandard),
    @"cinematic" : @(AVCaptureVideoStabilizationModeCinematic),
    @"cinematic-extended" : @(AVCaptureVideoStabilizationModeCinematicExtended),
  } mutableCopy];
  if (@available(iOS 17.0, *)) {
    table[@"preview-optimized"] = @(AVCaptureVideoStabilizationModePreviewOptimized);
  }
  if (@available(iOS 18.0, *)) {
    table[@"cinematic-extended-enhanced"] = @(AVCaptureVideoStabilizationModeCinematicExtendedEnhanced);
  }
  if (@available(iOS 26.0, *)) {
    table[@"low-latency"] = @(AVCaptureVideoStabilizationModeLowLatency);
  }
  return table;
}

static NSDictionary<NSString *, NSNumber *> *colorSpaceTable(void) {
  NSMutableDictionary *table = [@{
    @"srgb" : @(AVCaptureColorSpace_sRGB),
    @"p3-d65" : @(AVCaptureColorSpace_P3_D65),
    @"hlg-bt2020" : @(AVCaptureColorSpace_HLG_BT2020),
  } mutableCopy];
  if (@available(iOS 17.0, *)) {
    table[@"apple-log"] = @(AVCaptureColorSpace_AppleLog);
  }
  if (@available(iOS 26.0, *)) {
    table[@"apple-log-2"] = @(AVCaptureColorSpace_AppleLog2);
  }
  return table;
}

// MARK: - Parsing

static FakeCameraFormatSpec *parseFormat(NSDictionary *json, NSString *path) {
  if (![json isKindOfClass:[NSDictionary class]]) {
    @throw validationFailure(path, @"expected object");
  }
  FakeCameraFormatSpec *spec = [FakeCameraFormatSpec new];
  spec.name = requireString(json, @"name", path);
  spec.width = requirePositiveInteger(json, @"width", path);
  spec.height = requirePositiveInteger(json, @"height", path);
  spec.pixelFormatType = pixelFormatTable()[requireEnum(json, @"pixelFormat", pixelFormatTable(), path)].unsignedIntValue;

  NSArray *fpsRanges = requireArray(json, @"fpsRanges", path, YES);
  [fpsRanges enumerateObjectsUsingBlock:^(id range, NSUInteger index, BOOL *stop) {
    requireRange(range, [NSString stringWithFormat:@"%@.fpsRanges[%lu]", path, (unsigned long)index], 1, YES);
  }];
  spec.fpsRanges = fpsRanges;

  NSArray *photoDimensions = requireArray(json, @"photoDimensions", path, YES);
  NSMutableArray<NSValue *> *dimensions = [NSMutableArray array];
  [photoDimensions enumerateObjectsUsingBlock:^(id value, NSUInteger index, BOOL *stop) {
    CMVideoDimensions dims = requireDimensions(value, [NSString stringWithFormat:@"%@.photoDimensions[%lu]", path, (unsigned long)index]);
    [dimensions addObject:[NSValue valueWithBytes:&dims objCType:@encode(CMVideoDimensions)]];
  }];
  spec.photoDimensions = dimensions;

  spec.autoFocusSystem = autoFocusTable()[requireEnum(json, @"autoFocusSystem", autoFocusTable(), path)].integerValue;

  NSArray *modes = requireArray(json, @"videoStabilizationModes", path, NO);
  NSMutableArray<NSNumber *> *stabilizationModes = [NSMutableArray array];
  [modes enumerateObjectsUsingBlock:^(id mode, NSUInteger index, BOOL *stop) {
    NSString *modePath = [NSString stringWithFormat:@"%@.videoStabilizationModes[%lu]", path, (unsigned long)index];
    if (![mode isKindOfClass:[NSString class]] || stabilizationTable()[mode] == nil) {
      @throw validationFailure(modePath, [NSString stringWithFormat:@"unknown stabilization mode %@", mode]);
    }
    [stabilizationModes addObject:stabilizationTable()[mode]];
  }];
  requireUnique(modes, [path stringByAppendingString:@".videoStabilizationModes"], @"stabilization mode");
  spec.videoStabilizationModes = stabilizationModes;

  NSArray *colorSpaces = requireArray(json, @"colorSpaces", path, YES);
  NSMutableArray<NSNumber *> *colorSpaceValues = [NSMutableArray array];
  [colorSpaces enumerateObjectsUsingBlock:^(id colorSpace, NSUInteger index, BOOL *stop) {
    NSString *colorSpacePath = [NSString stringWithFormat:@"%@.colorSpaces[%lu]", path, (unsigned long)index];
    if (![colorSpace isKindOfClass:[NSString class]] || colorSpaceTable()[colorSpace] == nil) {
      @throw validationFailure(colorSpacePath, [NSString stringWithFormat:@"unknown color space %@", colorSpace]);
    }
    [colorSpaceValues addObject:colorSpaceTable()[colorSpace]];
  }];
  requireUnique(colorSpaces, [path stringByAppendingString:@".colorSpaces"], @"color space");
  spec.colorSpaces = colorSpaceValues;

  spec.binned = requireBool(json, @"binned", path);
  spec.videoHDR = requireBool(json, @"videoHDR", path);
  spec.highestPhotoQuality = requireBool(json, @"highestPhotoQuality", path);
  spec.highPhotoQuality = requireBool(json, @"highPhotoQuality", path);
  spec.multiCam = requireBool(json, @"multiCam", path);
  return spec;
}

static FakeCameraDeviceSpec *parseDevice(NSDictionary *json, NSString *path) {
  if (![json isKindOfClass:[NSDictionary class]]) {
    @throw validationFailure(path, @"expected object");
  }
  FakeCameraDeviceSpec *spec = [FakeCameraDeviceSpec new];
  spec.uniqueID = requireString(json, @"id", path);
  spec.name = requireString(json, @"name", path);
  spec.modelID = requireString(json, @"modelID", path);
  spec.deviceType = deviceTypeTable()[requireEnum(json, @"type", deviceTypeTable(), path)];
  spec.position = positionTable()[requireEnum(json, @"position", positionTable(), path)].integerValue;
  spec.hasFlash = requireBool(json, @"hasFlash", path);
  spec.hasTorch = requireBool(json, @"hasTorch", path);
  spec.supportsFocus = requireBool(json, @"supportsFocus", path);
  spec.supportsExposure = requireBool(json, @"supportsExposure", path);
  spec.supportsWhiteBalance = requireBool(json, @"supportsWhiteBalance", path);
  spec.supportsLowLightBoost = requireBool(json, @"supportsLowLightBoost", path);

  NSArray *zoom = requireArray(json, @"zoom", path, YES);
  requireRange(zoom, [path stringByAppendingString:@".zoom"], 1, YES);
  spec.minZoom = [zoom[0] doubleValue];
  spec.maxZoom = [zoom[1] doubleValue];

  NSArray *exposureBias = requireArray(json, @"exposureBias", path, YES);
  requireRange(exposureBias, [path stringByAppendingString:@".exposureBias"], -INFINITY, YES);
  spec.minExposureBias = [exposureBias[0] floatValue];
  spec.maxExposureBias = [exposureBias[1] floatValue];

  NSNumber *lensAperture = requireNumber(json, @"lensAperture", path);
  if (lensAperture.doubleValue <= 0) {
    @throw validationFailure([path stringByAppendingString:@".lensAperture"], @"must be positive");
  }
  spec.lensAperture = lensAperture.floatValue;
  spec.focalLength = requirePositiveInteger(json, @"focalLength", path);

  NSArray *formats = requireArray(json, @"formats", path, YES);
  NSMutableArray<FakeCameraFormatSpec *> *formatSpecs = [NSMutableArray array];
  [formats enumerateObjectsUsingBlock:^(id format, NSUInteger index, BOOL *stop) {
    [formatSpecs addObject:parseFormat(format, [NSString stringWithFormat:@"%@.formats[%lu]", path, (unsigned long)index])];
  }];
  requireUnique([formatSpecs valueForKey:@"name"], [path stringByAppendingString:@".formats"], @"format name");
  spec.formats = formatSpecs;
  return spec;
}

@implementation FakeCameraCatalog {
  NSString *_name;
  NSString *_sceneFileName;
  NSURL *_sceneURL;
  NSArray<FakeCameraDeviceSpec *> *_devices;
}

+ (instancetype)catalogNamed:(NSString *)name bundle:(NSBundle *)bundle error:(NSError **)error {
  NSURL *url = [bundle URLForResource:name withExtension:@"json" subdirectory:@"cameras"];
  if (url == nil) {
    if (error) {
      *error = [NSError errorWithDomain:FakeCameraErrorDomain
                                   code:1
                               userInfo:@{NSLocalizedDescriptionKey : [NSString stringWithFormat:@"cameras/%@.json is not bundled", name]}];
    }
    return nil;
  }
  NSData *data = [NSData dataWithContentsOfURL:url options:0 error:error];
  if (data == nil) {
    return nil;
  }
  id json = [NSJSONSerialization JSONObjectWithData:data options:0 error:error];
  if (json == nil) {
    return nil;
  }

  FakeCameraCatalog *catalog = [FakeCameraCatalog new];
  catalog->_name = [name copy];
  @try {
    if (![json isKindOfClass:[NSDictionary class]]) {
      @throw validationFailure(@"$", @"expected object");
    }
    NSNumber *schemaVersion = require(json, @"schemaVersion", [NSNumber class], @"$");
    if (schemaVersion.integerValue != kSchemaVersion) {
      @throw validationFailure(@"$.schemaVersion", [NSString stringWithFormat:@"expected %ld, got %@", (long)kSchemaVersion, schemaVersion]);
    }
    catalog->_sceneFileName = requireString(json, @"scene", @"$");
    catalog->_sceneURL = [bundle URLForResource:catalog->_sceneFileName withExtension:nil subdirectory:@"scenes"];
    if (catalog->_sceneURL == nil) {
      @throw validationFailure(@"$.scene", [NSString stringWithFormat:@"scene file \"%@\" does not exist in scenes/", catalog->_sceneFileName]);
    }
    NSArray *devices = requireArray(json, @"devices", @"$", YES);
    NSMutableArray<FakeCameraDeviceSpec *> *deviceSpecs = [NSMutableArray array];
    [devices enumerateObjectsUsingBlock:^(id device, NSUInteger index, BOOL *stop) {
      [deviceSpecs addObject:parseDevice(device, [NSString stringWithFormat:@"$.devices[%lu]", (unsigned long)index])];
    }];
    requireUnique([deviceSpecs valueForKey:@"uniqueID"], @"$.devices", @"device id");
    requireUnique([deviceSpecs valueForKey:@"name"], @"$.devices", @"device name");
    catalog->_devices = deviceSpecs;
  } @catch (NSException *exception) {
    if (error) {
      *error = [NSError errorWithDomain:FakeCameraErrorDomain code:2 userInfo:@{NSLocalizedDescriptionKey : exception.reason ?: @"invalid catalog"}];
    }
    return nil;
  }
  return catalog;
}

- (NSString *)name {
  return _name;
}

- (NSString *)sceneFileName {
  return _sceneFileName;
}

- (NSURL *)sceneURL {
  return _sceneURL;
}

- (NSArray<FakeCameraDeviceSpec *> *)devices {
  return _devices;
}

@end
