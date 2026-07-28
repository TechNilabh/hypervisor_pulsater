package main

type RegionCoord struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

var RegionCoords = map[string]RegionCoord{
	"US-EAST-1":  {Lat: 39.04, Lon: -77.48},
	"US-WEST-2":  {Lat: 45.52, Lon: -122.67},
	"EU-WEST-1":  {Lat: 53.33, Lon: -6.25},
	"AP-SOUTH-1": {Lat: 19.07, Lon: 72.87},
	"SA-EAST-1":  {Lat: -23.54, Lon: -46.63},
}

func ValidRegion(r string) bool {
	_, ok := RegionCoords[r]
	return ok
}
