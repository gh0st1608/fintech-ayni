terraform {
  required_version = ">= 1.10.0, < 2.0.0"

  required_providers {
    newrelic = {
      source  = "newrelic/newrelic"
      version = ">= 3.100, < 4.0"
    }
  }
}
