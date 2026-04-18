# HABE Makefile
# Requires: PBC library (libpbc), GMP (libgmp), OpenSSL (libssl, libcrypto)
#
# Ubuntu/Debian install:
#   sudo apt-get install libpbc-dev libgmp-dev libssl-dev
#
# macOS (Homebrew):
#   brew install pbc gmp openssl
#   export PKG_CONFIG_PATH="/opt/homebrew/opt/openssl/lib/pkgconfig"

CC      := gcc
CFLAGS  := -Wall -Wextra -O2 -g \
            -I./include \
            $(shell pkg-config --cflags pbc 2>/dev/null || echo "-I/usr/local/include/pbc -I/usr/include/pbc")
LDFLAGS := $(shell pkg-config --libs pbc 2>/dev/null || echo "-lpbc -lgmp") \
            -lssl -lcrypto -lm

SRC     := src/habe.c src/utils.c
OBJ     := $(SRC:.c=.o)
DEMO    := demo/main.o
CLI     := cli/habe_cli.o

TARGET      := habe_demo
CLI_TARGET  := habe_cli

.PHONY: all clean test cli

all: $(TARGET) $(CLI_TARGET)

$(TARGET): $(OBJ) $(DEMO)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

$(CLI_TARGET): $(OBJ) $(CLI)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)

%.o: %.c
	$(CC) $(CFLAGS) -c -o $@ $<

test: $(TARGET)
	./$(TARGET)

cli: $(CLI_TARGET)

clean:
	rm -f $(OBJ) $(DEMO) $(CLI) $(TARGET) $(CLI_TARGET)

print-flags:
	@echo "CFLAGS:  $(CFLAGS)"
	@echo "LDFLAGS: $(LDFLAGS)"