export class NgxConsole {
  static ngxConsoleFilter = (_level, _message) => true;

  static log(message, reason) {
    if (NgxConsole.ngxConsoleFilter("log", message)) {
      if (reason !== undefined) {
        console.log("%s", message, reason);
      } else {
        console.log(message);
      }
    }
  }

  static error(message, reason) {
    if (NgxConsole.ngxConsoleFilter("error", message)) {
      if (reason !== undefined) {
        console.error("%s", message, reason);
      } else {
        console.error(message);
      }
    }
  }

  static warn(message, reason) {
    if (NgxConsole.ngxConsoleFilter("warn", message)) {
      if (reason !== undefined) {
        console.warn("%s", message, reason);
      } else {
        console.warn(message);
      }
    }
  }

  static debug(message, reason) {
    if (NgxConsole.ngxConsoleFilter("debug", message)) {
      if (reason !== undefined) {
        console.warn("%s", message, reason);
      } else {
        console.warn(message);
      }
    }
  }

  get ngxConsoleFilter() {
    return NgxConsole.ngxConsoleFilter;
  }

  set ngxConsoleFilter(filter) {
    NgxConsole.ngxConsoleFilter = filter;
  }

  reset() {
    NgxConsole.ngxConsoleFilter = (_level, _message) => true;
  }
}
