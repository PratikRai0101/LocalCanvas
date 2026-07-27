#import <Foundation/Foundation.h>
#import <Vision/Vision.h>

static char *copy_utf8(NSString *value) {
  const char *utf8 = [value UTF8String];
  return utf8 ? strdup(utf8) : NULL;
}

char *localcanvas_recognize_text(const unsigned char *bytes, size_t length, char **error_message) {
  @autoreleasepool {
    NSData *image_data = [NSData dataWithBytes:bytes length:length];
    VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
    request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    request.usesLanguageCorrection = YES;
    if ([request respondsToSelector:@selector(setAutomaticallyDetectsLanguage:)]) {
      request.automaticallyDetectsLanguage = YES;
    }

    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithData:image_data options:@{}];
    NSError *error = nil;
    if (![handler performRequests:@[request] error:&error]) {
      if (error_message) *error_message = copy_utf8(error.localizedDescription ?: @"Vision could not recognize text.");
      return NULL;
    }

    NSMutableArray<NSString *> *lines = [NSMutableArray array];
    for (VNRecognizedTextObservation *observation in request.results ?: @[]) {
      VNRecognizedText *candidate = [[observation topCandidates:1] firstObject];
      if (candidate.string.length > 0) [lines addObject:candidate.string];
    }
    return copy_utf8([lines componentsJoinedByString:@"\n"]);
  }
}

void localcanvas_ocr_free(char *value) {
  free(value);
}
