package main

// RegionCoord holds the approximate geographic centre for a deployment region.
// These are used by the GLOBAL_ROUTING endpoint to provide lat/lon for globe
// marker placement. The values are static and intentionally approximate — no
// real GPS precision is needed for the visualisation.
type RegionCoord struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

// RegionCoords is the authoritative lookup table for all valid origin_region values.
// It must be kept in sync with the CHECK constraint / dropdown options on the frontend.
var RegionCoords = map[string]RegionCoord{
	"US-EAST-1":  {Lat: 39.04, Lon: -77.48},
	"US-WEST-2":  {Lat: 45.52, Lon: -122.67},
	"EU-WEST-1":  {Lat: 53.33, Lon: -6.25},
	"AP-SOUTH-1": {Lat: 19.07, Lon: 72.87},
	"SA-EAST-1":  {Lat: -23.54, Lon: -46.63},
}

// ValidRegion reports whether r is a known origin_region value.
func ValidRegion(r string) bool {
	_, ok := RegionCoords[r]
	return ok
}
