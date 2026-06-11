CC = gcc
CFLAGS = -Wall -Wextra -std=c11 -O2
TARGET = sysmon
OBJS = main.o monitor.o

.PHONY: all clean run

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^

main.o: main.c monitor.h
	$(CC) $(CFLAGS) -c main.c

monitor.o: monitor.c monitor.h
	$(CC) $(CFLAGS) -c monitor.c

clean:
	rm -f $(OBJS) $(TARGET)

run: $(TARGET)
	./$(TARGET)
