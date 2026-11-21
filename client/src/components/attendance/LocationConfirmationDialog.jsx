 import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import { MapPin, CheckCircle, AlertCircle, Home, Building, Loader2 } from 'lucide-react';
import { useToast } from '../../hooks/use-toast';

const LocationConfirmationDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  userLocation, 
  officeLocation, 
  isWithinOfficeRadius,
  distanceFromOffice 
}) => {
  const { toast } = useToast();
  const [selectedOption, setSelectedOption] = useState(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Reset selection when dialog opens
      setSelectedOption(null);
      setIsStarting(false);
    }
  }, [isOpen]);

  const handleStartDay = async (workFromHome = false) => {
    if (!selectedOption) {
      toast({
        title: "Please select an option",
        description: "Choose whether you're working from office or home",
        variant: "destructive"
      });
      return;
    }

    setIsStarting(true);
    try {
      await onConfirm(workFromHome);
    } catch (error) {
      console.error('Error starting day:', error);
      toast({
        title: "Error",
        description: "Failed to start day. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsStarting(false);
    }
  };

  const formatDistance = (distance) => {
    if (distance < 1000) {
      return `${Math.round(distance)}m`;
    }
    return `${(distance / 1000).toFixed(1)}km`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Confirm Work Location
          </DialogTitle>
          <DialogDescription>
            Please confirm your work location to start your day
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Location Info */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">Your Current Location</span>
              </div>
              <p className="text-xs text-blue-700">
                {userLocation?.address || 'Location detected'}
              </p>
              {distanceFromOffice && (
                <p className="text-xs text-blue-600 mt-1">
                  Distance from office: {formatDistance(distanceFromOffice)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Office Option */}
          <Card 
            className={`cursor-pointer transition-all ${
              selectedOption === 'office' 
                ? 'ring-2 ring-green-500 bg-green-50' 
                : 'hover:bg-gray-50'
            } ${
              isWithinOfficeRadius 
                ? 'border-green-200' 
                : 'border-gray-200 opacity-60'
            }`}
            onClick={() => isWithinOfficeRadius && setSelectedOption('office')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${
                    isWithinOfficeRadius ? 'bg-green-100' : 'bg-gray-100'
                  }`}>
                    <Building className={`h-4 w-4 ${
                      isWithinOfficeRadius ? 'text-green-600' : 'text-gray-400'
                    }`} />
                  </div>
                  <div>
                    <h3 className={`font-medium ${
                      isWithinOfficeRadius ? 'text-gray-900' : 'text-gray-400'
                    }`}>
                      Work from Office
                    </h3>
                    <p className={`text-xs ${
                      isWithinOfficeRadius ? 'text-gray-600' : 'text-gray-400'
                    }`}>
                      {officeLocation?.address || 'Blackhole Infiverse LLP, Mumbai'}
                    </p>
                  </div>
                </div>
                {isWithinOfficeRadius ? (
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-xs text-green-600 font-medium">Available</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="text-xs text-red-500 font-medium">Too far</span>
                  </div>
                )}
              </div>
              {selectedOption === 'office' && (
                <div className="mt-3 p-2 bg-green-100 rounded-lg">
                  <p className="text-xs text-green-700">
                    ✓ You're within office premises. Your attendance will be marked as "Office".
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Work from Home Option */}
          <Card 
            className={`cursor-pointer transition-all ${
              selectedOption === 'home' 
                ? 'ring-2 ring-blue-500 bg-blue-50' 
                : 'hover:bg-gray-50'
            }`}
            onClick={() => setSelectedOption('home')}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-full bg-blue-100">
                    <Home className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">Work from Home</h3>
                    <p className="text-xs text-gray-600">
                      Remote work from your current location
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <CheckCircle className="h-4 w-4 text-blue-600" />
                  <span className="text-xs text-blue-600 font-medium">Available</span>
                </div>
              </div>
              {selectedOption === 'home' && (
                <div className="mt-3 p-2 bg-blue-100 rounded-lg">
                  <p className="text-xs text-blue-700">
                    ✓ Your location will be locked for the day. Attendance will be marked as "WFH".
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-4">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1"
              disabled={isStarting}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => handleStartDay(selectedOption === 'home')}
              className="flex-1"
              disabled={!selectedOption || isStarting}
            >
              {isStarting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  Start Day
                  {selectedOption === 'office' && <Building className="ml-2 h-4 w-4" />}
                  {selectedOption === 'home' && <Home className="ml-2 h-4 w-4" />}
                </>
              )}
            </Button>
          </div>

          {/* Help Text */}
          <div className="text-xs text-gray-500 text-center pt-2 border-t">
            {isWithinOfficeRadius ? (
              "You can choose to work from office or home"
            ) : (
              "You're outside office premises. Please go to office or select Work from Home"
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LocationConfirmationDialog;