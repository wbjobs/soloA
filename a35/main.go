package main

import (
	"os"

	"github.com/chaos-cli/chaosctl/cmd"
)

func main() {
	if err := cmd.Execute(); err != nil {
		os.Exit(1)
	}
}
