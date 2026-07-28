#import <Foundation/Foundation.h>
#import <Speech/Speech.h>

static void write_message(char *output, size_t capacity, NSString *message) {
  if (capacity == 0) return;
  NSData *data = [message dataUsingEncoding:NSUTF8StringEncoding];
  size_t length = MIN(data.length, capacity - 1);
  memcpy(output, data.bytes, length);
  output[length] = '\0';
}

int localcanvas_transcribe_audio(const char *path, char *output, size_t output_capacity) {
  @autoreleasepool {
    if (@available(macOS 10.15, *)) {
      NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:path]];
      SFSpeechRecognizer *recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale currentLocale]];
      if (!recognizer || !recognizer.supportsOnDeviceRecognition) {
        write_message(output, output_capacity, @"On-device transcription isn't available for this language.");
        return 1;
      }

      __block SFSpeechRecognizerAuthorizationStatus authorization = [SFSpeechRecognizer authorizationStatus];
      if (authorization == SFSpeechRecognizerAuthorizationStatusNotDetermined) {
        dispatch_semaphore_t authorization_done = dispatch_semaphore_create(0);
        [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
          authorization = status;
          dispatch_semaphore_signal(authorization_done);
        }];
        dispatch_semaphore_wait(authorization_done, dispatch_time(DISPATCH_TIME_NOW, 30 * NSEC_PER_SEC));
      }
      if (authorization != SFSpeechRecognizerAuthorizationStatusAuthorized) {
        write_message(output, output_capacity, @"Speech recognition permission is required for transcription.");
        return 1;
      }

      SFSpeechURLRecognitionRequest *request = [[SFSpeechURLRecognitionRequest alloc] initWithURL:url];
      request.requiresOnDeviceRecognition = YES;
      request.shouldReportPartialResults = NO;
      __block NSString *transcript = nil;
      __block NSString *failure = nil;
      dispatch_semaphore_t completed = dispatch_semaphore_create(0);
      SFSpeechRecognitionTask *task = [recognizer recognitionTaskWithRequest:request resultHandler:^(SFSpeechRecognitionResult *result, NSError *error) {
        if (error) {
          failure = error.localizedDescription;
          dispatch_semaphore_signal(completed);
        } else if (result.isFinal) {
          transcript = result.bestTranscription.formattedString;
          dispatch_semaphore_signal(completed);
        }
      }];
      if (dispatch_semaphore_wait(completed, dispatch_time(DISPATCH_TIME_NOW, 120 * NSEC_PER_SEC)) != 0) {
        [task cancel];
        write_message(output, output_capacity, @"Transcription timed out.");
        return 1;
      }
      if (transcript.length > 0) {
        write_message(output, output_capacity, transcript);
        return 0;
      }
      write_message(output, output_capacity, failure ?: @"No speech was detected in this recording.");
      return 1;
    }
    write_message(output, output_capacity, @"On-device transcription requires macOS 10.15 or later.");
    return 1;
  }
}
